import {useCallback,useContext,useEffect,useSyncExternalStore} from 'react';
import WorkspaceContext from '../context/WorkspaceContext';
import AuthContext from '../context/AuthContext';
import {actionSnapshot,actionBusy,subscribeActions,performSessionAction,recoverSessionAction} from '../services/sessionActions';
import {getWorkOperation,changeWork} from '../services/trackingApi';
import {getAttendanceOperation,checkIn,checkOut} from '../services/attendanceApi';
import {trackingStore} from '../services/trackingState';
import {attendanceStore} from '../services/attendanceState';
export default function useSessionAction(){
  const {currentWorkspace}=useContext(WorkspaceContext)||{},{user}=useContext(AuthContext)||{};
  const workspaceId=currentWorkspace?._id||localStorage.getItem('workspaceId'),scope=`${workspaceId}:${user?._id||user?.id||'current'}`;
  const snapshot=useSyncExternalStore(subscribeActions,()=>actionSnapshot(scope));
  const read=useCallback(async entry=>{if(entry.kind==='work')return getWorkOperation(entry.operationId,entry.sessionId);
    const result=await getAttendanceOperation(entry.operationId);return {...result,data:result.session,summary:result.session?.checkoutSummary};},[]);
  const confirmed=useCallback((result,entry)=>{
    if(entry.kind==='work'&&result.session)trackingStore(scope,workspaceId).apply(result);
    if(entry.kind!=='work'){
      attendanceStore(scope,workspaceId).applyReceipt(result);
      const session=result.data?.checkInAt?result.data:result.session;
      if(session&&['CLOSED','COMPLETED','MISSED_CHECKOUT'].includes(session.status))trackingStore(scope,workspaceId).closeAttendance(session);
      else if(session?.status==='ACTIVE')trackingStore(scope,workspaceId).openAttendance(session);
    }
    window.dispatchEvent(new CustomEvent('flowtask:session-committed',{detail:{scope,kind:entry.kind}}));
  },[scope,workspaceId]);
  const recover=useCallback(()=>recoverSessionAction(scope,read,confirmed),[scope,read,confirmed]);
  useEffect(()=>{recover();window.addEventListener('online',recover);return()=>window.removeEventListener('online',recover);},[recover]);
  const run=useCallback((descriptor,send)=>performSessionAction(scope,descriptor,send,{read,onConfirmed:confirmed}),[scope,read,confirmed]);
  const retry=useCallback(async()=>{const entry=actionSnapshot(scope);if(entry.phase!=='RECONCILIATION_REQUIRED')return;
    return run(entry,()=>entry.kind==='work'?changeWork(entry.action,{...entry.payload,operationId:entry.operationId}):entry.action==='checkin'?checkIn(entry.payload):checkOut(entry.payload));},[scope,run]);
  return {...snapshot,busy:actionBusy(snapshot),run,recover,retry};
}

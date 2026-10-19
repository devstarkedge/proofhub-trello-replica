import {getMyTodayStatus} from './attendanceApi';
import {createSessionReadCache} from './sessionReadCache';
import {registerResettable} from '../store/resetRegistry';
const stores=new Map();
export function attendanceStore(scope,workspaceId){
  if(stores.has(scope))return stores.get(scope);
  const closed=new Set(),userId=scope.split(':').at(-1);
  const store=createSessionReadCache({field:'status',read:async()=>{
    const {data}=await getMyTodayStatus();return data;
  },merge:(current,next)=>{
    if(typeof next?.attendanceApplicable!=='boolean')return null;
    if(next.workspaceId&&String(next.workspaceId)!==String(workspaceId)||next.userId&&String(next.userId)!==userId)return null;
    if(next.activeSession&&closed.has(String(next.activeSession._id)))return null;
    if(current?.serverNow&&next.serverNow&&+new Date(next.serverNow)<+new Date(current.serverNow))return null;
    return {...next,serverNow:next.serverNow||new Date().toISOString()};
  }});
  store.applyReceipt=(receipt)=>{
    const session=receipt?.data?.checkInAt?receipt.data:receipt?.session;
    if(!session)return;
    if(session.workspaceId&&String(session.workspaceId)!==String(workspaceId)||session.user&&String(session.user?._id||session.user)!==userId)return;
    const done=['CLOSED','COMPLETED','MISSED_CHECKOUT'].includes(session.status),current=store.getSnapshot().status;
    if(done){closed.add(String(session._id));while(closed.size>32)closed.delete(closed.values().next().value);}
    if(!current){store.invalidate();return;}
    if(current.activeSession&&String(current.activeSession._id)!==String(session._id)&&+new Date(current.activeSession.checkInAt)>+new Date(session.checkInAt))return;
    const receiptTime=receipt.serverNow||session.checkOutAt||session.checkInAt;
    store.apply({...current,activeSession:done?null:session,completed:done,canCheckIn:false,canCheckOut:!done,serverNow:new Date(Math.max(+new Date(current.serverNow)||0,+new Date(receiptTime))).toISOString(),workedMinutes:receipt.summary?.attendanceSeconds!==undefined?receipt.summary.attendanceSeconds/60:current.workedMinutes});
  };
  const clear=store.clear;store.clear=()=>{closed.clear();clear();};
  stores.set(scope,store);return store;
}
export function clearAttendanceStates(){for(const store of stores.values())store.clear();}
registerResettable(clearAttendanceStates);

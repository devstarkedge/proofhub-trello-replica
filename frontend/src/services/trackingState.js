import {getTrackingState} from './trackingApi';
import {registerResettable} from '../store/resetRegistry';
import {createSessionReadCache} from './sessionReadCache';
const stores=new Map();
export function trackingStore(scope,workspaceId){
  if(stores.has(scope))return stores.get(scope);
  const closedAttendance=new Set(),userId=scope.split(':').at(-1);
  const store=createSessionReadCache({field:'state',read:getTrackingState,merge:(current,result)=>{
    if(String(result.workspaceId)!==String(workspaceId)||userId!=='current'&&String(result.userId)!==userId)return null;
    if(!current&&!result.policy)return null;
    const old=current?.session,next=result.session;
    if(next&&next.status!=='CLOSED'&&closedAttendance.has(String(next.attendanceSession)))return null;
    if(current&&next&&old&&String(next._id)===String(old._id)&&((next.revision??0)<(old.revision??0)||old.status==='CLOSED'&&next.status!=='CLOSED'))return null;
    if(current?.serverNow&&result.serverNow&&+new Date(result.serverNow)<+new Date(current.serverNow))return null;
    if(current&&next&&old&&String(next._id)!==String(old._id)&&+new Date(next.startedAt)<+new Date(old.startedAt))return null;
    return {...(current||{}),...result};
  }});
  const apply=store.apply;store.apply=result=>{const accepted=apply(result);if(!accepted&&!store.getSnapshot().state&&result.workspaceId===workspaceId&&String(result.userId)===userId)store.reload();return accepted;};
  store.openAttendance=session=>{
    if(closedAttendance.has(String(session._id)))return;
    store.invalidate();const current=store.getSnapshot().state;if(!current)return;
    if(String(current.attendance?._id)===String(session._id))return;
    const matching=String(current.session?.attendanceSession)===String(session._id);
    store.apply({...current,attendance:{_id:session._id,checkInAt:session.checkInAt,cutoffAt:session.missedCheckoutCutoffAt},session:matching?current.session:null,serverNow:new Date(Math.max(+new Date(current.serverNow),+new Date(session.checkInAt))).toISOString()});
  };
  store.closeAttendance=session=>{
    closedAttendance.add(String(session._id));while(closedAttendance.size>32)closedAttendance.delete(closedAttendance.values().next().value);
    store.invalidate();const current=store.getSnapshot().state;
    if(!current)return;
    const work=current.session,matching=String(work?.attendanceSession)===String(session._id);
    const elapsed=Math.max(0,(+new Date(session.checkOutAt)-+new Date(current.serverNow))/1000),running=matching&&work.status==='RUNNING',last=work?.segments?.at(-1);
    const totals=matching?{...work.totals,workSeconds:(work.totals?.workSeconds||0)+(running?elapsed:0),assignedSeconds:(work.totals?.assignedSeconds||0)+(running&&last?.kind==='TASK'?elapsed:0)}:work?.totals;
    store.apply({...current,attendance:String(current.attendance?._id)===String(session._id)?null:current.attendance,session:matching?{...work,status:'CLOSED',endedAt:session.checkOutAt,totals}:work,serverNow:new Date(Math.max(+new Date(current.serverNow),+new Date(session.checkOutAt)||Date.now())).toISOString()});
  };
  const clear=store.clear;store.clear=()=>{closedAttendance.clear();clear();};
  stores.set(scope,store);return store;
}
export function clearTrackingStates(){for(const store of stores.values())store.clear();}
registerResettable(clearTrackingStates);

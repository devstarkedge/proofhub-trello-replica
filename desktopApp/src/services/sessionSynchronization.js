import {trackingStore,clearTrackingStates} from './trackingState';
import {attendanceStore,clearAttendanceStates} from './attendanceState';
import {retainWorkSelectionPrefetch,invalidateWorkSelections} from './workSelectionState';
const owners=new Map();
export function retainSessionSynchronization(scope,workspaceId,authorizationKey){
  let entry=owners.get(scope);
  if(entry){clearTimeout(entry.release);entry.count++;if(entry.authorizationKey!==authorizationKey){entry.authorizationKey=authorizationKey;entry.secureRefresh();}entry.ensure();return()=>release(scope,entry);}
  const tracking=trackingStore(scope,workspaceId),attendance=attendanceStore(scope,workspaceId),userId=scope.split(':').at(-1);
  let refreshTimer,workRefreshTimer,boundaryTimer,lastBoundary='',channel,sessionToken=localStorage.getItem('token');
  const current=()=>localStorage.getItem('workspaceId')===String(workspaceId)&&Boolean(sessionToken)&&localStorage.getItem('token')===sessionToken;
  const refresh=()=>{if(current()){tracking.reload();attendance.reload();}};
  const schedule=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,100);};
  const invalidate=()=>{tracking.invalidate();attendance.invalidate();schedule();};
  const secureRefresh=()=>{sessionToken=localStorage.getItem('token');invalidateWorkSelections(scope,true);tracking.clear();attendance.clear();tracking.invalidate();attendance.invalidate();schedule();};
  const realtime=event=>{
    const {type='',payload={}}=event.detail||{};
    if(payload.workspaceId&&String(payload.workspaceId)!==String(workspaceId))return;
    if(/role|permission|department|membership|access|workspace.*updated/.test(type)){secureRefresh();return;}
    if(/^(board|project)[-:]/.test(type)){tracking.invalidate();clearTimeout(workRefreshTimer);workRefreshTimer=setTimeout(()=>{if(current())tracking.reload();},100);return;}
    if(payload.userId&&String(payload.userId)!==userId)return;
    if(!/^(tracking:|attendance:|leave:)/.test(type))return;
    const known=tracking.getSnapshot().state?.session;
    if(type==='tracking:changed'&&known&&String(payload.sessionId)===String(known._id)&&Number.isInteger(payload.revision)&&payload.revision<=known.revision)return;
    invalidate();
  };
  const disconnected=()=>{tracking.disconnected();attendance.disconnected();};
  const rejected=()=>{tracking.clear();attendance.clear();tracking.disconnected('Session access changed. Reconnect or sign in again.');attendance.disconnected('Session access changed. Reconnect or sign in again.');};
  const committed=event=>{
    if(event.detail?.scope&&event.detail.scope!==scope)return;
    if(event.detail?.kind!=='work')invalidate();
    channel?.postMessage({scope});
  };
  const storage=event=>{if(['token','workspaceId'].includes(event.key)){if(!current()||event.key==='token'){clearTrackingStates();clearAttendanceStates();rejected();}}};
  const boundary=()=>{
    clearTimeout(boundaryTimer);
    const a=attendance.getSnapshot().status,t=tracking.getSnapshot().state,session=a?.activeSession;
    const cutoff=session?.missedCheckoutCutoffAt||t?.attendance?.cutoffAt;if(!cutoff)return;
    const key=`${session?._id||t?.attendance?._id}:${cutoff}`;if(key===lastBoundary)return;
    const anchor=a?.serverNow?a:t,now=anchor?.serverNow?+new Date(anchor.serverNow)+Math.max(0,performance.now()-anchor.receivedAt):Date.now();
    boundaryTimer=setTimeout(()=>{lastBoundary=key;invalidate();},Math.min(2147483647,Math.max(0,+new Date(cutoff)-now)));
  };
  try{if(typeof BroadcastChannel!=='undefined'){channel=new BroadcastChannel('flowtask-session-invalidations');channel.onmessage=event=>{if(event.data?.scope===scope)invalidate();};}}catch{/* Socket.IO plus bounded polling remains available. */}
  const events=[['flowtask:realtime',realtime],['flowtask:tracking-refresh',invalidate],['socket-attendance-updated',invalidate],['flowtask:session-committed',committed],['online',invalidate],['socket-connected',invalidate],['desktop-resume',invalidate],['socket-disconnected',disconnected],['socket-auth-expired',rejected],['socket-workspace-rejected',rejected],['storage',storage]];
  for(const [name,handler]of events)window.addEventListener(name,handler);
  const visibility=()=>{if(document.visibilityState==='visible'&&current()){tracking.ensure();attendance.ensure();}};document.addEventListener('visibilitychange',visibility);
  const poll=setInterval(()=>{if(current())refresh();},60000),unsubscribers=[tracking.subscribe(boundary),attendance.subscribe(boundary),retainWorkSelectionPrefetch(scope,workspaceId,tracking)];
  entry={count:1,authorizationKey,secureRefresh,ensure(){if(current()){tracking.ensure();attendance.ensure();}},close(){clearTimeout(refreshTimer);clearTimeout(workRefreshTimer);clearTimeout(boundaryTimer);clearInterval(poll);channel?.close();for(const unsubscribe of unsubscribers)unsubscribe();for(const [name,handler]of events)window.removeEventListener(name,handler);document.removeEventListener('visibilitychange',visibility);}};
  owners.set(scope,entry);tracking.ensure();attendance.ensure();boundary();return()=>release(scope,entry);
}
function release(scope,entry){if(--entry.count===0)entry.release=setTimeout(()=>{if(entry.count)return;entry.close();owners.delete(scope);},0);}

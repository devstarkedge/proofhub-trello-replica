import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import useWorkTracking from '../../hooks/useWorkTracking';
import { changeWork, errorMessage } from '../../services/trackingApi';
import { Button } from '../ui/button';
import WorkSelectionModal from './WorkSelectionModal';
import { formatTrackingClock as duration } from '../../utils/duration';
const style = { color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)' };
export default function TrackingPanel({ compact = false }) {
  const {state,error,reload} = useWorkTracking();
  const [clock,setClock] = useState(0), [selecting,setSelecting] = useState(()=>new URLSearchParams(window.location.search).get('start')==='1'?'work':false), [busy,setBusy] = useState(false);
  const [native,setNative] = useState(null);
  useEffect(()=>{ const timer=setInterval(()=>setClock(performance.now()),1000); return()=>clearInterval(timer); },[]);
  useEffect(()=>{const tracking=window.flowtaskDesktop?.tracking;tracking?.getStatus().then(setNative).catch(()=>{});return tracking?.onStatus(setNative);},[]);
  if (!state) return compact ? null : <p role="status">{error || 'Loading work tracking…'}</p>;
  const session = state.session, open = session?.segments.find(s=>!s.endedAt), latest = open || session?.segments.at(-1);
  const delta = Math.max(0,(clock-state.receivedAt)/1000);
  const workSeconds = (session?.totals.workSeconds||0)+(session?.status==='RUNNING'?delta:0);
  const officeSeconds = state.attendance ? Math.max(0,(Math.min(+new Date(state.serverNow)+delta*1000,state.attendance.cutoffAt?+new Date(state.attendance.cutoffAt):Infinity)-+new Date(state.attendance.checkInAt))/1000):0;
  const device = state.devices.find(d=>d.connected && d.activeSession===session?._id)||state.devices.find(d=>d.connected);
  const scopedNative=native?.workspaceId===String(state.workspaceId)&&native?.userId===state.userId?native:null;
  const capture = window.flowtaskDesktop ? scopedNative?.state || device?.state || 'unavailable' : device ? `Connected desktop · ${device.state}` : 'Capture unavailable · desktop app required';
  const action = async (name,selection=null,operationId=crypto.randomUUID()) => {
    setBusy(true);try{if(name==='pause')await window.flowtaskDesktop?.tracking?.stop?.();await changeWork(name,{selection,operationId,expectedRevision:session?.revision??null});await window.flowtaskDesktop?.tracking?.refresh();await reload();window.dispatchEvent(new Event('flowtask:tracking-refresh'));return true;}
    catch(e){toast.error(errorMessage(e));await window.flowtaskDesktop?.tracking?.refresh();await reload();return false;}finally{setBusy(false);}
  };
  return <div className={compact?'mt-2 max-w-sm rounded-xl bg-white/10 p-3 text-left':'rounded-2xl border p-5 text-left'} style={compact?undefined:style}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs"><span>Time Tracking · {state.policy.activationState?.replaceAll('_',' ')}</span>{state.canManagePolicy&&<Link className="underline" to="/workspace-settings">Workspace tracking configuration</Link>}</div>
    {latest && <><p className="font-bold">{latest.agenda?`${latest.agendaTitle} — ${latest.description}`:latest.projectName}</p><p className="text-sm">{latest.kind==='TASK'?latest.taskTitle:'Individual agenda work'} · {session.status.toLowerCase()}</p></>}
    <div className="my-2 flex flex-wrap gap-4 text-sm"><span>Work <strong className="tabular-nums">{duration(workSeconds)}</strong></span><span>Office <strong className="tabular-nums">{duration(officeSeconds)}</strong></span></div>
    {latest?.assignedAt && <p className="mb-2 text-xs">Assigned {new Date(latest.assignedAt).toLocaleString()} · pre-assignment {duration(session.totals.preAssignmentSeconds)} · assigned {duration(session.totals.assignedSeconds+(session.status==='RUNNING'&&open?.kind==='TASK'?delta:0))}</p>}
    {state.attendance && state.canTrack && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={()=>setSelecting('work')}>{session?'Switch work':'Start work'}</Button>
      {latest?.kind==='INDIVIDUAL' && session?.status!=='CLOSED' && <Button size="sm" variant="outline" disabled={busy} onClick={()=>setSelecting('link')}>Link assigned task</Button>}
      {session && session.status!=='CLOSED' && (session.status==='PAUSED'||state.policy.personalPauseEnabled!==false) && <Button size="sm" variant="outline" disabled={busy} onClick={()=>action(session.status==='RUNNING'?'pause':'resume')}>{session.status==='RUNNING'?'Take Break':'Resume Work'}</Button>}
    </div>}
    <p className="mt-2 text-xs" role="status">{capture.replaceAll('-',' ')}{scopedNative?.pending ? ` · ${scopedNative.pending} uploads pending`:''}</p>
    {scopedNative?.error&&<p className="mt-1 text-xs">{scopedNative.error}</p>}
    {scopedNative?.noticeRequired&&<button className="mt-2 text-xs underline" onClick={()=>window.dispatchEvent(new Event('flowtask:monitoring-notice'))}>Review monitoring notice</button>}
    {window.flowtaskDesktop&&!scopedNative?.noticeRequired&&(scopedNative?.state==='permission-required'||scopedNative?.state==='monitoring'&&scopedNative?.error)&&<button className="mt-2 text-xs underline" onClick={()=>window.flowtaskDesktop.tracking.recoverPermissions().catch(e=>toast.error(e.message))}>Review desktop permissions</button>}
    {compact&&<Link className="mt-2 block text-xs underline" to="/time-tracking">Timesheets and screenshots</Link>}
    {error&&<p role="alert" className="mt-2 text-xs">{error}</p>}
    {selecting&&state.canTrack&&<WorkSelectionModal currentSession={session} linking={selecting==='link'} onClose={()=>setSelecting(false)} onConfirm={(selection,operationId)=>action(selecting==='link'?'link':session?'switch':'start',selection,operationId)} />}
  </div>;
}

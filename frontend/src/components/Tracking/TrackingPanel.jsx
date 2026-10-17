import { useEffect, useState, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import {Popover} from 'radix-ui';
import {Clock3, FolderKanban, ArrowLeftRight, Coffee, Play, MoreHorizontal, CloudUpload, TriangleAlert} from 'lucide-react';
import { toast } from 'react-toastify';
import useWorkTracking from '../../hooks/useWorkTracking';
import {normalizeDesktopTrackingStatus,stopDesktopCapture,DESKTOP_RESTART_MESSAGE} from '../../services/desktopTracking';
import { changeWork, errorMessage } from '../../services/trackingApi';
import { Button } from '../ui/button';
import WorkSelectionModal from './WorkSelectionModal';
import { formatTrackingClock as duration } from '../../utils/duration';
const style = { color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)' };
export default function TrackingPanel({ compact = false, attendanceHeader, attendanceActions, attendanceDetails, attendanceWarning = false }) {
  const {state,error,reload} = useWorkTracking();
  const [detailsOpen,setDetailsOpen] = useState(false), [detailsView,setDetailsView] = useState('actions'), detailsId = useId(), detailsFocus = useRef(null);
  useEffect(()=>{setDetailsOpen(false);},[state?.workspaceId]);
  const [clock,setClock] = useState(0), [selecting,setSelecting] = useState(()=>new URLSearchParams(window.location.search).get('start')==='1'?'work':false), [busy,setBusy] = useState(false);
  const isDesktop=window.flowtaskDesktop?.isDesktop===true;
  const [native,setNative] = useState(null),[retrying,setRetrying]=useState(false);
  useEffect(()=>{ const timer=setInterval(()=>setClock(performance.now()),1000); return()=>clearInterval(timer); },[]);
  useEffect(()=>{const tracking=window.flowtaskDesktop?.tracking;if(!isDesktop||!tracking)return;const changed=value=>setNative(normalizeDesktopTrackingStatus(value));const outdated=()=>changed(null);tracking.getStatus().then(changed).catch(outdated);const unsubscribe=tracking.onStatus(changed);window.addEventListener('flowtask:desktop-update-required',outdated);return()=>{unsubscribe?.();window.removeEventListener('flowtask:desktop-update-required',outdated);};},[isDesktop]);
  if (!state) return compact ? <div className="welcome-controls welcome-tracking-panel"><div className="welcome-tracking-header"><span>Time Tracking</span>{attendanceHeader}</div><p role={error ? 'alert' : 'status'} className="py-3 text-sm">{error || 'Loading work tracking…'}</p>{error && <button className="welcome-action" onClick={reload}>Retry tracking</button>}<div className="welcome-actions">{attendanceActions}</div>{attendanceDetails && <details className="mt-3 text-xs"><summary className="cursor-pointer">Attendance details{attendanceWarning ? ' · Needs attention' : ''}</summary><div className="mt-2">{attendanceDetails}</div></details>}</div> : <p role="status">{error || 'Loading work tracking…'}</p>;
  const session = state.session, open = session?.segments.find(s=>!s.endedAt), latest = open || session?.segments.at(-1);
  const delta = Math.max(0,(clock-state.receivedAt)/1000);
  const workSeconds = (session?.totals.workSeconds||0)+(session?.status==='RUNNING'?delta:0);
  const officeSeconds = state.attendance ? Math.max(0,(Math.min(+new Date(state.serverNow)+delta*1000,state.attendance.cutoffAt?+new Date(state.attendance.cutoffAt):Infinity)-+new Date(state.attendance.checkInAt))/1000):0;
  const device = state.devices.find(d=>d.connected && d.activeSession===session?._id)||state.devices.find(d=>d.connected);
  const scopedNative=native?.updateRequired?native:native?.workspaceId===String(state.workspaceId)&&native?.userId===state.userId?native:null;
  const capture = isDesktop ? scopedNative?.state || device?.state || 'unavailable' : device ? `Connected desktop · ${device.state}` : 'Capture unavailable · desktop app required';
  const action = async (name,selection=null,operationId=crypto.randomUUID()) => {
    setBusy(true);try{if(name==='pause'&&!await stopDesktopCapture())toast.warning(DESKTOP_RESTART_MESSAGE);await changeWork(name,{selection,operationId,expectedRevision:session?.revision??null});await window.flowtaskDesktop?.tracking?.refresh();await reload();window.dispatchEvent(new Event('flowtask:tracking-refresh'));return true;}
    catch(e){toast.error(errorMessage(e));await window.flowtaskDesktop?.tracking?.refresh();await reload();return false;}finally{setBusy(false);}
  };
  const nativeError = compact && !scopedNative?.errorCode && session?.status !== 'RUNNING' && scopedNative?.error === 'Work is not running' ? '' : scopedNative?.error;
  const diagnostics = <>
    <p className="mt-2 text-xs" role="status">{capture.replaceAll('-',' ')}{scopedNative?.pending ? ` · ${scopedNative.pending} uploads pending`:''}</p>
    {isDesktop&&scopedNative?.pending>0&&<p className="mt-1 text-xs">Pending screenshots retry automatically when connected.</p>}
    {isDesktop&&scopedNative?.uploadError&&<p role="alert" className="mt-1 text-xs">Upload waiting: {scopedNative.uploadError}{scopedNative.nextUploadRetryAt?` Next retry ${new Date(scopedNative.nextUploadRetryAt).toLocaleTimeString()}.`:''}</p>}
    {isDesktop&&scopedNative?.pending>0&&typeof window.flowtaskDesktop?.tracking?.retryUploads==='function'&&<button disabled={retrying} className="mt-2 text-xs underline" onClick={async()=>{setRetrying(true);try{setNative(normalizeDesktopTrackingStatus(await window.flowtaskDesktop.tracking.retryUploads()));}catch(e){toast.error(e.message);}finally{setRetrying(false);}}}>{retrying?'Retrying uploads…':'Retry uploads now'}</button>}
    {isDesktop&&scopedNative?.protectedCopies>0&&<p className="mt-1 text-xs text-amber-600">{scopedNative.protectedCopies} captures exceeded the size/readability limit. Activity is recorded; these are not pending uploads.</p>}
    {nativeError&&<p className="mt-1 text-xs">{nativeError}</p>}
    {device?.lastUploadError&&<p role="alert" className="mt-1 text-xs">Desktop upload: {device.lastUploadError}</p>}
    {isDesktop&&scopedNative?.noticeRequired&&<button className="mt-2 text-xs underline" onClick={()=>window.dispatchEvent(new Event('flowtask:monitoring-notice'))}>Review monitoring notice</button>}
    {isDesktop&&!scopedNative?.noticeRequired&&(scopedNative?.state==='permission-required'||scopedNative?.state==='monitoring'&&scopedNative?.error)&&<button className="mt-2 text-xs underline" onClick={()=>window.flowtaskDesktop.tracking.recoverPermissions().catch(e=>toast.error(e.message))}>Review desktop permissions</button>}
    {error&&<p role="alert" className="mt-2 text-xs">{error}</p>}

  </>;
  const workModal = selecting && state.canTrack && <WorkSelectionModal currentSession={session} linking={selecting==='link'} onClose={()=>setSelecting(false)} onConfirm={(selection,operationId)=>action(selecting==='link'?'link':session?'switch':'start',selection,operationId)} />;
  if (compact) {
    const running = state.policy.enabled && session?.status === 'RUNNING', paused = session?.status === 'PAUSED';
    const label = !state.policy.enabled ? 'Disabled' : running ? 'Running' : paused ? 'Paused' : 'Enabled';
    const project = latest ? latest.attributedProjectName || (latest.agenda ? `${latest.agendaTitle} — ${latest.description}` : latest.projectName) : 'No work selected';
    const task = latest ? latest.attributedTaskTitle || (latest.kind === 'TASK' ? latest.taskTitle : 'Individual agenda work') : 'Start work after checking in';
    const warning = Boolean(attendanceWarning || error || nativeError || scopedNative?.uploadError || device?.lastUploadError || scopedNative?.protectedCopies);
    const showDetails = event => {detailsFocus.current = event.currentTarget;setDetailsView('monitoring');setDetailsOpen(true);};
    return <div className="welcome-controls welcome-tracking-panel">
      <Popover.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
        <div className="welcome-tracking-header">
          <div className="welcome-tracking-state"><span className={`welcome-status-dot ${running?'is-running':paused?'is-paused':''}`} aria-hidden="true"/><span>Time Tracking</span><span className={`welcome-state-badge ${running?'is-running':''}`}>{label}</span></div>
          <div className="welcome-header-actions">{attendanceHeader}<Popover.Trigger asChild><button type="button" className="welcome-more" aria-label="More tracking actions" onClick={event=>{detailsFocus.current=event.currentTarget;setDetailsView('actions');}}><MoreHorizontal size={19}/></button></Popover.Trigger></div>
        </div>
        <div className="welcome-tracking-context">
          <div className="welcome-project"><span className="welcome-project-icon"><FolderKanban size={20}/></span><div className="min-w-0"><p title={project} className="welcome-project-name">{project}</p><p title={task} className="welcome-task-name">{task}</p></div></div>
          <div className="welcome-timer"><span>Work</span><strong><Clock3 size={14}/><span>{duration(workSeconds)}</span></strong></div>
          <div className="welcome-timer"><span>Office</span><strong><Clock3 size={14}/><span>{duration(officeSeconds)}</span></strong></div>
        </div>
        <div className="welcome-actions">
          {state.attendance && state.canTrack && <>
            <button type="button" className="welcome-action welcome-action-primary" disabled={busy} onClick={()=>setSelecting('work')}><ArrowLeftRight size={15}/>{session?'Switch Work':'Start Work'}</button>
            {session && session.status!=='CLOSED' && (paused || state.policy.personalPauseEnabled!==false) && <button type="button" className="welcome-action" disabled={busy} onClick={()=>action(running?'pause':'resume')}>{running?<Coffee size={15}/>:<Play size={15}/>}<span>{running?'Take Break':'Resume Work'}</span></button>}
          </>}
          {attendanceActions}
        </div>
        <div className="welcome-attendance-info">{attendanceDetails}</div>
        {latest?.agenda && latest.attributedTask && <p className="welcome-work-provenance">Origin: {latest.agendaTitle} — {latest.description} · Task attribution: {latest.attributionIncluded ? 'Yes' : 'No'}</p>}
        {latest?.assignedAt && <p className="welcome-work-provenance">Assigned {new Date(latest.assignedAt).toLocaleString()} · pre-assignment {duration(session.totals.preAssignmentSeconds)} · assigned {duration(session.totals.assignedSeconds+(running&&open?.kind==='TASK'?delta:0))}</p>}
        <div className="welcome-monitoring-summary" role="status"><span className="welcome-capture-label" title={capture}>{capture.replaceAll('-',' ')}</span>
          {scopedNative?.pending>0 && <button type="button" className="welcome-status-chip" onClick={showDetails} aria-expanded={detailsOpen} aria-controls={detailsId} aria-haspopup="dialog"><CloudUpload size={13}/>{scopedNative.pending} uploads pending</button>}
          {warning && <button type="button" className="welcome-status-chip welcome-warning-chip" onClick={showDetails} aria-expanded={detailsOpen} aria-controls={detailsId} aria-haspopup="dialog"><TriangleAlert size={13}/>Needs attention</button>}
        </div>
        <Popover.Portal><Popover.Content id={detailsId} sideOffset={10} collisionPadding={12} align="end" className="welcome-details-popover" aria-label={detailsView === 'actions' ? 'More tracking actions' : 'Monitoring status'} onCloseAutoFocus={event=>{if(detailsFocus.current?.isConnected){event.preventDefault();detailsFocus.current.focus();}}}>
          <h2 className="mb-3 text-sm font-semibold">{detailsView === 'actions' ? 'More actions' : 'Monitoring status'}</h2>
          {detailsView === 'actions' ? <nav aria-label="Tracking actions" className="welcome-secondary-actions">
            <Link to="/time-tracking">Timesheets and screenshots</Link>
            {state.canManagePolicy && <Link to="/workspace-settings">Workspace tracking configuration</Link>}
            {latest?.kind==='INDIVIDUAL' && session?.status!=='CLOSED' && state.attendance && state.canTrack && <button type="button" disabled={busy} onClick={()=>{setDetailsOpen(false);setSelecting('link');}}>Link assigned task</button>}
            <button type="button" onClick={()=>setDetailsView('monitoring')}>Monitoring status and recovery</button>
          </nav> : <>{diagnostics}<button type="button" className="mt-3 text-xs underline" onClick={()=>setDetailsView('actions')}>Back to actions</button></>}
        </Popover.Content></Popover.Portal>
      </Popover.Root>
      {workModal}
    </div>;
  }
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
    {diagnostics}
    {workModal}
  </div>;
}

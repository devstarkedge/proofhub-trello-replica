import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Clock3, BriefcaseBusiness, Loader2, X, ShieldCheck, TriangleAlert } from 'lucide-react';
import { readCheckoutPreview } from '../../services/checkoutPreviewState';
import { actionSnapshot } from '../../services/sessionActions';
import { formatHours, formatTrackingClock } from '../../utils/duration';
import { Button } from '../ui/button';
import PresenceStatusBadge from './PresenceStatusBadge';
import { LOGGED_TIME_REASON_MAX_LENGTH, normalizeCheckoutTaskReason } from '../../../../shared/checkoutTaskReasons.mjs';
import '../../../../shared/checkoutConfirmation.css';

const surface={backgroundColor:'var(--color-card-bg)',color:'var(--color-text-primary)',borderColor:'var(--color-border-default)'};
const muted={color:'var(--color-text-secondary)'};

function checkoutOutcomeStatus(outcome) {
  if (outcome.provisional) return 'PROVISIONAL';
  if (outcome.leaveState === 'FULL_LEAVE') return 'ON_LEAVE';
  return outcome.presenceState;
}

function checkoutWarningMessage(warning, uncoveredEarlyMinutes) {
  const minutes = warning.minutes ?? uncoveredEarlyMinutes;
  if (warning.code === 'EARLY_EXIT' && Number.isFinite(minutes)) {
    return `${formatHours(minutes)} of early departure outside approved leave.`;
  }
  return warning.message;
}

export default function CheckOutConfirmationModal({attendanceSessionId,onClose,onConfirm,onInactive,actionScope}) {
  const [preview,setPreview]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [reasons, setReasons] = useState(() => {
    const previous = actionSnapshot(actionScope);
    return String(previous.sessionId) === String(attendanceSessionId) && previous.kind === 'attendance-checkout'
      ? Object.fromEntries((previous.payload?.taskReasons || []).map(({ taskId, reason }) => [taskId, reason]))
      : {};
  });
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const generation=useRef(0),inFlight=useRef(false),operation=useRef(crypto.randomUUID());
  const refresh=useCallback(async(options={})=>{
    if(inFlight.current)return;
    const request=++generation.current;setLoading(true);
    try{
      const {data}=await readCheckoutPreview(actionScope,attendanceSessionId,{force:options.force===true});
      if(request!==generation.current)return;
      if(String(data.attendanceSessionId)!==String(attendanceSessionId)){onInactive?.();return;}
      setPreview(data);setError('');
    }catch(e){if(request!==generation.current)return;setError(e.response?.data?.message||'Could not load your checkout preview. Check your connection and retry.');if(e.response?.data?.code==='NO_ACTIVE_SESSION')onInactive?.();}
    finally{if(request===generation.current)setLoading(false);}
  },[attendanceSessionId,onInactive,actionScope]);
  const invalidate=useCallback(()=>{++generation.current;},[]);
  useEffect(()=>{
    refresh();const fresh=()=>refresh({force:true});const timer=setInterval(fresh,30000);
    const realtime=e=>{if(/^(leave:|attendance:|tracking:)|user-role-changed|department-bulk-|access.*updated|permissions.*updated/.test(e.detail?.type||''))fresh();};
    window.addEventListener('flowtask:realtime',realtime);window.addEventListener('online',fresh);window.addEventListener('socket-connected',fresh);
    return()=>{invalidate();clearInterval(timer);window.removeEventListener('flowtask:realtime',realtime);window.removeEventListener('online',fresh);window.removeEventListener('socket-connected',fresh);};
  },[refresh,invalidate]);
  const close=()=>{if(!inFlight.current)onClose();};
  const tasks = preview?.checkoutTasks || [];
  const taskReasons = tasks.map(({ taskId }) => ({ taskId, reason: normalizeCheckoutTaskReason(reasons[taskId]) }));
  const reasonsValid = taskReasons.every(({ reason }) => reason !== null);
  const confirm=async()=>{
    if(inFlight.current||loading||error||!preview?.canConfirm||!reasonsValid)return;
    inFlight.current=true;++generation.current;setSaving(true);setNotice('');
    try{const pending=onConfirm(preview,operation.current,taskReasons);
      if(actionSnapshot(actionScope).phase==='PENDING')setSubmitted(true);
      const result=await pending;if(!mounted.current)return;
      if(result!==false)onClose();else setSubmitted(false);}

    catch(e){
      if(!mounted.current)return;
      if(actionSnapshot(actionScope).phase==='RECONCILIATION_REQUIRED'){onClose();return;}
      setSubmitted(false);
      const updated=e.response?.data?.data?.checkoutPreview;
      if(updated){setPreview(updated);setError('');setNotice(e.response.data.message);}
      else setError(e.response?.data?.message||'Checkout could not be confirmed. Your saved session will be checked again when you retry.');
    }finally{inFlight.current=false;if(mounted.current)setSaving(false);}
  };
  const time=value=>value?new Intl.DateTimeFormat(undefined,{timeZone:preview.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
  if(submitted)return null;
  return <Dialog.Root open onOpenChange={open=>{if(!open)close();}}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[999] bg-black/60"/>
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[1000] max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6" style={surface} onEscapeKeyDown={e=>{if(inFlight.current)e.preventDefault();}} onPointerDownOutside={e=>{if(inFlight.current)e.preventDefault();}}>
      <div className="flex items-start justify-between gap-3"><Dialog.Title className="text-lg font-semibold">Finish your workday?</Dialog.Title><button type="button" aria-label="Close checkout preview" disabled={saving} onClick={close} className="rounded p-1"><X size={19}/></button></div>
      <Dialog.Description className="mt-1 text-sm" style={muted}>Review your attendance and work time before checking out.</Dialog.Description>
      {loading&&!preview&&<p role="status" className="my-6 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin"/>Loading your attendance…</p>}
      {preview&&<div className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">{[[<Clock3 size={15}/>, 'Office Time',preview.attendanceSeconds],[<BriefcaseBusiness size={15}/>, 'Tracked Work',preview.trackedWorkSeconds]].map(([icon,label,seconds])=><div key={label} className="rounded-xl border p-3" style={surface}><p className="flex items-center gap-2 text-xs" style={muted}>{icon}{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{seconds===null?'Unavailable':formatTrackingClock(seconds)}</p></div>)}</div>
        <dl className="space-y-1 text-xs" style={muted}><div className="flex flex-wrap justify-between gap-2"><dt>Checked in</dt><dd>{time(preview.checkInAt)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>Proposed checkout</dt><dd>{time(preview.proposedCheckOutAt)}</dd></div></dl>
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            Expected outcome
            <PresenceStatusBadge status={checkoutOutcomeStatus(preview.outcome)} label={preview.outcome.label} />
          </p>
          <p className="mt-1 text-xs" style={muted}>{preview.outcome.explanation}</p>
        </div>
        {preview.approvedLeaves.length > 0 && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16} />Approved leave</p>
          {preview.approvedLeaves.map((leave, index) => <p key={`${leave.requestId}-${index}`} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <PresenceStatusBadge status={leave.dayType === 'SHORT_LEAVE' ? 'SHORT_LEAVE' : 'ON_LEAVE'} label={leave.type} />
            <span>{leave.coverageResolved ? `${time(leave.startedAt)} – ${time(leave.endedAt)}` : 'Time coverage requires review'}</span>
          </p>)}
        </div>}
        {preview.warnings.map(warning => <p key={warning.code} className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs">
          <TriangleAlert size={15} className="shrink-0" />{checkoutWarningMessage(warning, preview.uncoveredEarlyMinutes)}
        </p>)}
        {!preview.canConfirm&&<p role="alert" className="text-xs">This session reached its missed-checkout cutoff. Refresh Attendance to review regularization.</p>}
        {preview.pendingUploads>0&&<p className="text-xs" style={muted}>{preview.pendingUploads} screenshots pending. Saved captures can continue uploading after checkout without adding work time.</p>}
        {tasks.length > 0 && <fieldset className="space-y-3" disabled={saving}>
          <legend className="mb-2 text-sm font-semibold">Work reasons for tracked tasks</legend>
          {tasks.map(task => <div key={task.taskId} className="rounded-xl border p-3" style={surface}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p id={`checkout-task-${task.taskId}`} className="break-words text-sm font-semibold">{task.title}</p>
                <p className="break-words text-xs" style={muted}>{task.project}</p>
              </div>
              <span className="shrink-0 text-sm tabular-nums">{formatTrackingClock(task.durationMs / 1000)}</span>
            </div>
            <label className="mt-3 block text-xs font-medium" htmlFor={`checkout-reason-${task.taskId}`}>Work reason / Description (required)</label>
            <textarea id={`checkout-reason-${task.taskId}`} aria-describedby={`checkout-task-${task.taskId}`}
              className="checkout-work-reason mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm" style={{ borderColor: surface.borderColor }}
              rows={2} maxLength={LOGGED_TIME_REASON_MAX_LENGTH} required value={reasons[task.taskId] || ''}
              onChange={event => { const value = event.target.value; setReasons(previous => ({ ...previous, [task.taskId]: value })); }} />
          </div>)}
        </fieldset>}
        <p className="text-xs" style={muted}>Times in {preview.timezone}. Leave and Personal Pause do not add tracked work time.{loading?' Refreshing preview…':''}</p>
      </div>}
      {notice&&<p role="status" className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm">{notice}</p>}
      {error&&<div role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm"><p>{error}</p><button type="button" disabled={saving||loading} onClick={()=>refresh({force:true})} className="mt-2 underline">Refresh preview</button></div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={close}>Continue Working</Button><Button disabled={saving||loading||Boolean(error)||!preview?.canConfirm||!reasonsValid} onClick={confirm} aria-busy={saving}>{saving&&<Loader2 size={15} className="animate-spin"/>}{saving?'Checking Out…':'Confirm Check-Out'}</Button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

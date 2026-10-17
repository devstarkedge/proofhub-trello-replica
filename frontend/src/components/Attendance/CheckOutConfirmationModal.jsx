import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Clock3, BriefcaseBusiness, Loader2, X, ShieldCheck, TriangleAlert } from 'lucide-react';
import { getCheckoutPreview } from '../../services/attendanceApi';
import { formatTrackingClock } from '../../utils/duration';
import { Button } from '../ui/button';

const surface={backgroundColor:'var(--color-card-bg)',color:'var(--color-text-primary)',borderColor:'var(--color-border-default)'};
const muted={color:'var(--color-text-secondary)'};
export default function CheckOutConfirmationModal({attendanceSessionId,onClose,onConfirm,onInactive}) {
  const [preview,setPreview]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const generation=useRef(0),inFlight=useRef(false),operation=useRef(crypto.randomUUID());
  const refresh=useCallback(async()=>{
    if(inFlight.current)return;
    const request=++generation.current;setLoading(true);
    try{
      const {data}=await getCheckoutPreview();
      if(request!==generation.current)return;
      if(String(data.attendanceSessionId)!==String(attendanceSessionId)){onInactive?.();return;}
      setPreview(data);setError('');
    }catch(e){if(request!==generation.current)return;setError(e.response?.data?.message||'Could not load your checkout preview. Check your connection and retry.');if(e.response?.data?.code==='NO_ACTIVE_SESSION')onInactive?.();}
    finally{if(request===generation.current)setLoading(false);}
  },[attendanceSessionId,onInactive]);
  const invalidate=useCallback(()=>{++generation.current;},[]);
  useEffect(()=>{
    refresh();const timer=setInterval(refresh,30000);
    const realtime=e=>{if(/^(leave:|attendance:|tracking:)|user-role-changed|department-bulk-|access.*updated|permissions.*updated/.test(e.detail?.type||''))refresh();};
    window.addEventListener('flowtask:realtime',realtime);window.addEventListener('online',refresh);window.addEventListener('socket-connected',refresh);
    return()=>{invalidate();clearInterval(timer);window.removeEventListener('flowtask:realtime',realtime);window.removeEventListener('online',refresh);window.removeEventListener('socket-connected',refresh);};
  },[refresh,invalidate]);
  const close=()=>{if(!inFlight.current)onClose();};
  const confirm=async()=>{
    if(inFlight.current||loading||error||!preview?.canConfirm)return;
    inFlight.current=true;++generation.current;setSaving(true);setNotice('');
    try{if(await onConfirm(preview,operation.current)!==false)onClose();}
    catch(e){
      const updated=e.response?.data?.data?.checkoutPreview;
      if(e.response?.data?.code==='CHECKOUT_RECONFIRM_REQUIRED'&&updated){setPreview(updated);setError('');setNotice('Your attendance or approved leave changed. Review the updated outcome and confirm again.');}
      else setError(e.response?.data?.message||'Checkout could not be confirmed. Your saved session will be checked again when you retry.');
    }finally{inFlight.current=false;setSaving(false);}
  };
  const time=value=>value?new Intl.DateTimeFormat(undefined,{timeZone:preview.timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';
  return <Dialog.Root open onOpenChange={open=>{if(!open)close();}}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[999] bg-black/60"/>
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[1000] max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:p-6" style={surface} onEscapeKeyDown={e=>{if(inFlight.current)e.preventDefault();}} onPointerDownOutside={e=>{if(inFlight.current)e.preventDefault();}}>
      <div className="flex items-start justify-between gap-3"><Dialog.Title className="text-lg font-semibold">Finish your workday?</Dialog.Title><button type="button" aria-label="Close checkout preview" disabled={saving} onClick={close} className="rounded p-1"><X size={19}/></button></div>
      <Dialog.Description className="mt-1 text-sm" style={muted}>Review your attendance and work time before checking out.</Dialog.Description>
      {loading&&!preview&&<p role="status" className="my-6 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin"/>Loading your attendance…</p>}
      {preview&&<div className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">{[[<Clock3 size={15}/>, 'Office Time',preview.attendanceSeconds],[<BriefcaseBusiness size={15}/>, 'Tracked Work',preview.trackedWorkSeconds]].map(([icon,label,seconds])=><div key={label} className="rounded-xl border p-3" style={surface}><p className="flex items-center gap-2 text-xs" style={muted}>{icon}{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{seconds===null?'Unavailable':formatTrackingClock(seconds)}</p></div>)}</div>
        <dl className="space-y-1 text-xs" style={muted}><div className="flex flex-wrap justify-between gap-2"><dt>Checked in</dt><dd>{time(preview.checkInAt)}</dd></div><div className="flex flex-wrap justify-between gap-2"><dt>Proposed checkout</dt><dd>{time(preview.proposedCheckOutAt)}</dd></div></dl>
        <div><p className="text-sm font-semibold">Expected outcome · {preview.outcome.label}</p><p className="mt-1 text-xs" style={muted}>{preview.outcome.explanation}</p></div>
        {preview.approvedLeaves.length>0&&<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck size={16}/>Approved leave</p>{preview.approvedLeaves.map((leave,index)=><p key={`${leave.requestId}-${index}`} className="mt-1 text-xs">{leave.type} · {leave.coverageResolved?`${time(leave.startedAt)} – ${time(leave.endedAt)}`:'Time coverage requires review'}</p>)}</div>}
        {preview.warnings.map(warning=><p key={warning.code} className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs"><TriangleAlert size={15} className="shrink-0"/>{warning.message}</p>)}
        {!preview.canConfirm&&<p role="alert" className="text-xs">This session reached its missed-checkout cutoff. Refresh Attendance to review regularization.</p>}
        {preview.pendingUploads>0&&<p className="text-xs" style={muted}>{preview.pendingUploads} screenshots pending. Saved captures can continue uploading after checkout without adding work time.</p>}
        <p className="text-xs" style={muted}>Times in {preview.timezone}. Leave and Personal Pause do not add tracked work time.{loading?' Refreshing preview…':''}</p>
      </div>}
      {notice&&<p role="status" className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm">{notice}</p>}
      {error&&<div role="alert" className="mt-3 rounded-lg bg-red-500/10 p-3 text-sm"><p>{error}</p><button type="button" disabled={saving||loading} onClick={refresh} className="mt-2 underline">Refresh preview</button></div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={close}>Continue Working</Button><Button disabled={saving||loading||Boolean(error)||!preview?.canConfirm} onClick={confirm} aria-busy={saving}>{saving&&<Loader2 size={15} className="animate-spin"/>}{saving?'Checking Out…':'Confirm Check-Out'}</Button></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

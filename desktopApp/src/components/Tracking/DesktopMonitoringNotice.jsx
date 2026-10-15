import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../ui/button';

export default function DesktopMonitoringNotice({status}){
  const [dismissed,setDismissed]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef(null);
  const key=status?.noticeRequired?`${status.workspaceId}:${status.userId}:${status.deviceId}:${status.noticeVersion}`:'';
  const visible=Boolean(key&&dismissed!==key);
  useEffect(()=>{const review=()=>{setDismissed('');setError('');};window.addEventListener('flowtask:monitoring-notice',review);return()=>window.removeEventListener('flowtask:monitoring-notice',review);},[]);
  useEffect(()=>{if(!visible)return;const before=document.activeElement;dialog.current?.focus();return()=>before?.focus?.();},[visible]);
  if(!visible)return null;
  const policy=status.policy;
  const accept=async()=>{setBusy(true);setError('');try{await window.flowtaskDesktop.tracking.acceptNotice({deviceId:status.deviceId,workspaceId:status.workspaceId,userId:status.userId,policyRevision:policy.revision});}catch(e){setError(e.message);}finally{setBusy(false);}};
  return createPortal(<div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4"><section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Workspace desktop monitoring notice" className="w-full max-w-lg rounded-2xl border p-6 space-y-4" style={{backgroundColor:'var(--color-card-bg)',color:'var(--color-text-primary)',borderColor:'var(--color-border-default)'}} onKeyDown={event=>{if(event.key==='Escape'&&!busy)setDismissed(key);if(event.key==='Tab'){const buttons=[...event.currentTarget.querySelectorAll('button:not([disabled])')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
    <h2 className="text-lg font-bold">Desktop monitoring for this workspace</h2>
    <p className="text-sm">During running work, FlowTask captures your permitted screens and counts mouse presses and keyboard keydowns. It measures active and idle time separately. Typed text, key identities, passwords and cursor coordinates are never recorded. Screenshots may contain visible sensitive information.</p>
    <p className="text-sm">Your workspace Admin controls monitoring settings and may update them. Current policy: every {policy.intervalSeconds/60} minutes · {policy.monitors==='all'?'all permitted monitors':'primary monitor'} · {policy.blur?'blurred':'unblurred'} WebP images · {policy.retentionDays===null?'no automatic expiry':`${policy.retentionDays} day retention`}.</p>
    <p className="text-sm">Monitoring stops during Personal Pause, Check-Out and logout. A visible status shows when it is active. You can revoke desktop access in Settings. OS permissions remain under your control.</p>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setDismissed(key)}>Not now</Button><Button disabled={busy} onClick={accept}>{busy?'Continuing…':'Agree and continue'}</Button></div>
  </section></div>,document.body);
}

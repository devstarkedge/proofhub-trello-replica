import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import useWorkTracking from '../../hooks/useWorkTracking';
import { changeWork, errorMessage, saveDevicePreferences, revokeDevice, getAgentRelease, getScreenshotStorageHealth } from '../../services/trackingApi';
import { Button } from '../ui/button';
import WorkSelectionModal from './WorkSelectionModal';
import { formatTrackingClock as duration } from '../../utils/duration';
const style = { color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)' };
function MonitorPreferences({ state, reload, onClose }) {
  const [release,setRelease] = useState(null);
  const [storageHealth,setStorageHealth] = useState(null);
  const [deviceId,setDeviceId] = useState(state.devices[0]?._id || '');
  const device = state.devices.find(d=>d._id===deviceId);
  const [preferences,setPreferences] = useState(device?.preferences || { enabled:false,intervalSeconds:state.policy.intervalSeconds,monitors:'primary',blur:false,excludedDisplayIds:[],excludeWindowTitles:[] });
  const [consent,setConsent] = useState(false), [busy,setBusy] = useState(false);
  const save = async () => {
    setBusy(true); try { await saveDevicePreferences(deviceId,{preferences,consentRevision:consent?state.policy.revision:0});
      window.dispatchEvent(new Event('flowtask:tracking-refresh')); await window.flowtaskDesktop?.tracking?.refresh();
      await reload(); onClose();
    } catch(e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return <div className="space-y-3 rounded-xl border p-4 text-left" style={style}>
    <h3 className="font-semibold">Desktop monitoring and privacy</h3>
    {state.canManagePolicy&&<Button size="sm" variant="outline" onClick={async()=>{try{setStorageHealth(await getScreenshotStorageHealth());}catch(e){toast.error(errorMessage(e));}}}>Check screenshot storage</Button>}
    {storageHealth&&<p className="text-xs" role="status">{storageHealth.available?'Private R2 screenshot storage is available.':storageHealth.message}</p>}
    <Button size="sm" variant="outline" onClick={async()=>{try{setRelease(await getAgentRelease());}catch(e){toast.error(errorMessage(e));}}}>Check desktop updates</Button>
    {release && <p className="text-xs">{release.configured ? <>Latest desktop: {release.version} · <a className="underline" href={release.downloadUrl} target="_blank" rel="noreferrer">Download installer</a></> : 'Your workspace has not configured a desktop release link.'}</p>}
    <p className="text-xs">When enabled, FlowTask captures selected full screens and counts mouse button presses and keyboard keydowns. It records active/idle seconds separately. No typed text, key values, passwords, or cursor positions are recorded. Screenshots can contain visible sensitive information; use blur, exclusions, or turn monitoring off.</p>
    {!device ? <p className="text-sm">Open and sign in to the FlowTask desktop app to register a device. Browser screenshot capture is unavailable.</p> : <>
      <label className="block text-sm">Device<select className="ml-2 rounded border p-2" style={style} value={deviceId} onChange={e=>{ const next=state.devices.find(d=>d._id===e.target.value);setDeviceId(e.target.value);setPreferences(next.preferences);setConsent(false); }}>{state.devices.map(d=><option key={d._id} value={d._id}>{d.name} · {d.platform}</option>)}</select></label>
      <label className="block text-sm"><input type="checkbox" checked={preferences.enabled} onChange={e=>setPreferences({...preferences,enabled:e.target.checked})} /> Enable monitoring on this device</label>
      <p className="text-sm">Workspace screenshot interval: {state.policy.intervalSeconds/60} minutes · Monitors: {state.policy.monitors}. The workspace Admin controls these settings.</p>
      <label className="block text-sm"><input type="checkbox" checked={preferences.blur} onChange={e=>setPreferences({...preferences,blur:e.target.checked})} /> Blur screenshots before upload</label>
      <label className="block text-sm">Exclude monitor IDs (comma separated)<input className="mt-1 w-full rounded border p-2" style={style} value={(preferences.excludedDisplayIds||[]).join(',')} onChange={e=>setPreferences({...preferences,excludedDisplayIds:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} /></label>
      <label className="block text-sm">Exclude when a window title contains (comma separated)<input className="mt-1 w-full rounded border p-2" style={style} value={(preferences.excludeWindowTitles||[]).join(',')} onChange={e=>setPreferences({...preferences,excludeWindowTitles:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})} /></label>
      <p className="text-xs">Window exclusions suppress the whole capture interval whenever a matching window is present. {state.policy.retentionDays===null?'New images have no automatic expiry.':`New images and activity expire after ${state.policy.retentionDays} days.`} Activity measures interaction, not work output.</p>
      <label className="block text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /> I have reviewed the monitoring notice and consent to these settings (policy {state.policy.revision}).</label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || preferences.enabled&&!consent} onClick={save}>Save settings</Button><Button variant="outline" onClick={async()=>{ try {await revokeDevice(deviceId);await reload();onClose();}catch(e){toast.error(errorMessage(e));} }}>Revoke device</Button></div>
    </>}
    <Button variant="outline" onClick={onClose}>Close</Button>
  </div>;
}
export default function TrackingPanel({ compact = false }) {
  const {state,error,reload} = useWorkTracking();
  const [clock,setClock] = useState(0), [selecting,setSelecting] = useState(()=>new URLSearchParams(window.location.search).get('start')==='1'?'work':false), [settings,setSettings] = useState(false), [busy,setBusy] = useState(false);
  const [native,setNative] = useState(null);
  useEffect(()=>{ const timer=setInterval(()=>setClock(performance.now()),1000); return()=>clearInterval(timer); },[]);
  useEffect(()=>{const tracking=window.flowtaskDesktop?.tracking;tracking?.getStatus().then(setNative).catch(()=>{});return tracking?.onStatus(setNative);},[]);
  if (!state) return compact ? null : <p role="status">{error || 'Loading work tracking…'}</p>;
  const session = state.session, open = session?.segments.find(s=>!s.endedAt), latest = open || session?.segments.at(-1);
  const delta = Math.max(0,(clock-state.receivedAt)/1000);
  const workSeconds = (session?.totals.workSeconds||0)+(session?.status==='RUNNING'?delta:0);
  const officeSeconds = state.attendance ? Math.max(0,(Math.min(+new Date(state.serverNow)+delta*1000,state.attendance.cutoffAt?+new Date(state.attendance.cutoffAt):Infinity)-+new Date(state.attendance.checkInAt))/1000):0;
  const device = state.devices.find(d=>d.connected && d.activeSession===session?._id);
  const capture = window.flowtaskDesktop ? native?.state || device?.state || 'unavailable' : device ? `Connected desktop · ${device.state}` : 'Capture unavailable · desktop app required';
  const action = async (name,selection=null,operationId=crypto.randomUUID()) => {
    setBusy(true);try{await changeWork(name,{selection,operationId,expectedRevision:session?.revision??null});await window.flowtaskDesktop?.tracking?.refresh();await reload();window.dispatchEvent(new Event('flowtask:tracking-refresh'));return true;}
    catch(e){toast.error(errorMessage(e));await reload();return false;}finally{setBusy(false);}
  };
  return <div className={compact?'mt-2 max-w-sm rounded-xl bg-white/10 p-3 text-left':'rounded-2xl border p-5 text-left'} style={compact?undefined:style}>
    {latest && <><p className="font-bold">{latest.agenda?`${latest.agendaTitle} — ${latest.description}`:latest.projectName}</p><p className="text-sm">{latest.kind==='TASK'?latest.taskTitle:'Individual agenda work'} · {session.status.toLowerCase()}</p></>}
    <div className="my-2 flex flex-wrap gap-4 text-sm"><span>Work <strong className="tabular-nums">{duration(workSeconds)}</strong></span><span>Office <strong className="tabular-nums">{duration(officeSeconds)}</strong></span></div>
    {latest?.assignedAt && <p className="mb-2 text-xs">Assigned {new Date(latest.assignedAt).toLocaleString()} · pre-assignment {duration(session.totals.preAssignmentSeconds)} · assigned {duration(session.totals.assignedSeconds+(session.status==='RUNNING'&&open?.kind==='TASK'?delta:0))}</p>}
    {state.attendance && state.canTrack && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={()=>setSelecting('work')}>{session?'Switch work':'Start work'}</Button>
      {latest?.kind==='INDIVIDUAL' && session?.status!=='CLOSED' && <Button size="sm" variant="outline" disabled={busy} onClick={()=>setSelecting('link')}>Link assigned task</Button>}
      {session && session.status!=='CLOSED' && (session.status==='PAUSED'||state.policy.personalPauseEnabled!==false) && <Button size="sm" variant="outline" disabled={busy} onClick={()=>action(session.status==='RUNNING'?'pause':'resume')}>{session.status==='RUNNING'?'Take Break':'Resume Work'}</Button>}
    </div>}
    <p className="mt-2 text-xs" role="status">{capture}{native?.pending ? ` · ${native.pending} uploads pending`:''}</p>
    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs"><button className="underline" onClick={()=>setSettings(!settings)}>Monitoring settings</button>{compact&&<Link className="underline" to="/time-tracking">Timesheets and screenshots</Link>}</div>
    {error&&<p role="alert" className="mt-2 text-xs">{error}</p>}
    {settings&&<div className="mt-3"><MonitorPreferences state={state} reload={reload} onClose={()=>setSettings(false)} /></div>}
    {selecting&&state.canTrack&&<WorkSelectionModal currentSession={session} linking={selecting==='link'} onClose={()=>setSelecting(false)} onConfirm={(selection,operationId)=>action(selecting==='link'?'link':session?'switch':'start',selection,operationId)} />}
  </div>;
}

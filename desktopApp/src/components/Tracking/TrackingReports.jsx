import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import WorkspaceContext from '../../context/WorkspaceContext';
import { toast } from 'react-toastify';
import { getReports, getReportMembers, getTimeline, getScreenshotUrl, errorMessage } from '../../services/trackingApi';
import { formatTrackingClock as duration } from '../../utils/duration';
import { Button } from '../ui/button';
const style = { color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)' };
const dateTime = (value, timezone) => new Date(value).toLocaleString(undefined,{timeZone:timezone || 'UTC'});
const workTitle=s=>s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle} (origin: ${s.agendaTitle} — ${s.description})`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName} / ${s.taskTitle||'Individual'}`;
function SessionTimeline({session,timezone,filterKey}) {
  const requestVersion=useRef(0),previewVersion=useRef(0);
  const [data,setData] = useState(null), [preview,setPreview] = useState(null), [error,setError] = useState('');
  useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url);},[preview]);
  const load = useCallback(async before=>{const version=++requestVersion.current;try{const next=await getTimeline(session._id,before,JSON.parse(filterKey));if(version!==requestVersion.current)return;setData(previous=>before&&previous?{...next,intervals:[...previous.intervals,...next.intervals],screenshots:[...previous.screenshots,...next.screenshots]}:next);}catch(e){if(version===requestVersion.current){setData(null);setError(errorMessage(e));}}},[session._id,filterKey]);
  useEffect(()=>{const version=requestVersion;load();return()=>{version.current++;};},[load]);
  useEffect(()=>{const invalidate=()=>{requestVersion.current++;previewVersion.current++;};const refresh=()=>{previewVersion.current++;setPreview(null);setData(null);load();};window.addEventListener('flowtask:realtime',refresh);const timer=setInterval(refresh,15000);return()=>{invalidate();window.removeEventListener('flowtask:realtime',refresh);clearInterval(timer);};},[load]);
  useEffect(()=>{const escape=e=>{if(e.key==='Escape')setPreview(null);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  const show = async screenshot=>{const version=++previewVersion.current;try{const result=await getScreenshotUrl(screenshot._id);if(version!==previewVersion.current){URL.revokeObjectURL(result.url);return;}setPreview({...result,screenshot});}catch(e){toast.error(errorMessage(e));}};
  return <div className="mt-3 space-y-3 border-t pt-3" style={style}>
    <p className="text-xs">Times shown in {timezone}. Input counts measure interaction, not output or a productivity score.</p>
    {session.segments.map((s,i)=><p className="text-xs" key={s._id||i}>{workTitle(s)} · {dateTime(s.startedAt,timezone)} – {s.endedAt?dateTime(s.endedAt,timezone):'running'}{s.assignedAt?` · assigned ${dateTime(s.assignedAt,timezone)}`:''}{s.attributedAt?` · explicitly included ${dateTime(s.attributedAt,timezone)}`:''}</p>)}
    {error&&<p role="alert">{error}</p>}
    {data?.evidence && <div className="text-xs space-y-1"><p>Activity {data.evidence.activityPercent===null?'N/A':`${data.evidence.activityPercent.toFixed(1)}%`} · eligible input coverage {duration(data.evidence.eligibleInputSeconds)} · mouse presses {data.evidence.mouseCount??'N/A'} · keydowns {data.evidence.keyboardCount??'N/A'}</p><p>Uploaded capture windows {data.evidence.capturedWindows}/{data.evidence.eligibleWindows} · success {data.evidence.captureSuccessPercent===null?'N/A':`${data.evidence.captureSuccessPercent.toFixed(1)}%`} · images pending {data.evidence.pendingScreenshots}{data.evidence.provisional?' · provisional':''}</p><p>These totals cover recorded windows only. Missing agent periods remain unknown; monitor images do not multiply global counters.</p></div>}
    {(session.pauses||[]).map((p,i)=><p className="text-xs" key={`pause-${i}`}>Personal Pause · {dateTime(p.startedAt,timezone)} – {p.endedAt?dateTime(p.endedAt,timezone):'ongoing'}</p>)}
    {!!data?.coverageGaps?.length && <details><summary className="cursor-pointer text-sm">{data.coverageGaps.length} desktop coverage gaps (work time is preserved)</summary>{data.coverageGaps.map((gap,i)=><p className="text-xs" key={i}>{dateTime(gap.startedAt,timezone)} – {dateTime(gap.endedAt,timezone)}</p>)}</details>}
    {data&&!data.intervals.length&&<p className="text-sm">No desktop coverage uploaded for this session. Work and attendance time are still recorded.</p>}
    {data?.intervals.map(interval=>{
      const images=data.screenshots.filter(s=>s.interval===interval._id),seconds=interval.inputEligibleSeconds;
      return <div className="rounded-lg border p-3 text-sm" style={style} key={interval._id}>
        <p>{dateTime(interval.startedAt,timezone)} – {dateTime(interval.endedAt,timezone)} · {interval.coverage}</p><p className="text-xs">{interval.contexts?.map(c=>c.title).join(' → ')}{interval.contexts?.length>1?' · Mixed interval: counts are not split across tasks.':''}</p>
        <p className="mt-1 text-xs">Mouse presses: {interval.mouseCount??'unavailable'} · Keyboard keydowns: {interval.keyboardCount??'unavailable'} · Active: {interval.activeSeconds==null?'unknown':duration(interval.activeSeconds)} · Idle: {interval.idleSeconds==null?'unknown':duration(interval.idleSeconds)} · Activity {seconds>0?`${Math.round(interval.inputActiveSeconds/seconds*100)}%`:'N/A'} · policy {interval.policyRevision??'legacy'}</p>
        <div className="mt-2 flex flex-wrap gap-2">{images.map(s=><Button size="sm" variant="outline" key={s._id} disabled={s.status!=='READY'} onClick={()=>show(s)}>Screen {s.displayId} · {s.uploadStatus||s.status}{s.blurred?' · blurred':''}</Button>)}{!images.length&&<span className="text-xs">Screenshot unavailable, pending, excluded, expired, or outside your access.</span>}</div>
      </div>;
    })}
    {data?.nextBefore&&<Button variant="outline" onClick={()=>load(data.nextBefore)}>Earlier intervals</Button>}
    {preview&&<div role="dialog" aria-modal="true" aria-label="Private screenshot preview" className="fixed inset-0 z-[100] overflow-auto space-y-2 p-4" style={style}><Button autoFocus variant="outline" onClick={()=>setPreview(null)}>Close screenshot</Button><img className="max-h-[90vh] w-full rounded-lg object-contain" src={preview.url} alt={`Monitor ${preview.screenshot.displayId} at ${dateTime(preview.screenshot.capturedAt,timezone)}`} onError={()=>setError('Preview expired. Open the screenshot again.')} /></div>}
    <details><summary className="cursor-pointer text-sm">Immutable work history</summary>{session.audit.map(a=><p key={a.id} className="text-xs">{dateTime(a.at,timezone)} · {a.type}</p>)}</details>
  </div>;
}
export default function TrackingReports({team=false,initialFilters={}}) {
  const {currentWorkspace}=useContext(WorkspaceContext)||{};const workspaceId=currentWorkspace?._id;
  const requestVersion=useRef(0);
  const [response,setData]=useState(null),[error,setError]=useState(''),[expanded,setExpanded]=useState('');
  const [fromDate,setFromDate]=useState(initialFilters.fromDate||''),[toDate,setToDate]=useState(initialFilters.toDate||''),[userId,setUserId]=useState(initialFilters.userId||'');
  const data=String(response?.workspaceId)===String(workspaceId)?response:null;
  const [members,setMembers]=useState([]);
  useEffect(()=>{if(team)getReportMembers().then(setMembers).catch(()=>{});},[team]);
  const filterKey=JSON.stringify(initialFilters);
  const load=useCallback(async cursor=>{const version=++requestVersion.current;try{const next=await getReports({...JSON.parse(filterKey),team,fromDate,toDate,userId:userId||undefined,cursor});if(String(next.workspaceId)!==String(workspaceId))return;if(version!==requestVersion.current)return;setData(old=>cursor&&old?{...next,sessions:[...old.sessions,...next.sessions]}:next);setError('');}catch(e){if(version===requestVersion.current){setData(null);setError(errorMessage(e));}}},[team,fromDate,toDate,userId,filterKey,workspaceId]);
  useEffect(()=>{const version=requestVersion;load();return()=>{version.current++;};},[load]);
  useEffect(()=>{const refresh=()=>{setExpanded('');setData(null);load();if(team)getReportMembers().then(setMembers).catch(()=>setMembers([]));};window.addEventListener('flowtask:realtime',refresh);return()=>window.removeEventListener('flowtask:realtime',refresh);},[load,team]);
  return <section className="rounded-2xl border p-5" style={style}>
    <h2 className="mb-3 text-base font-bold">{team?'Team work timesheets':'My work timesheets'} and activity</h2>
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><label>From <input aria-label="Work reports from" className="rounded border p-2" style={style} type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} /></label><label>To <input aria-label="Work reports to" className="rounded border p-2" style={style} type="date" value={toDate} onChange={e=>setToDate(e.target.value)} /></label>{team&&<label>Member <select className="rounded border p-2" style={style} value={userId} onChange={e=>setUserId(e.target.value)}><option value="">All authorized members</option>{members.map(member=><option value={member._id} key={member._id}>{member.name}</option>)}</select></label>}<Button variant="outline" onClick={()=>load()}>Refresh</Button></div>
    {error&&<p role="alert" className="text-sm">{error}</p>}
    {data&&!data.sessions.length&&<p className="text-sm">No work sessions in this range.</p>}
    {data?.sessions.map(s=><article key={s._id} className="border-b py-3" style={style}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{s.workDateKey} · {workTitle(s.segments.at(-1)||{})} {team?`· ${s.userName || s.user}`:''}</p>
        <p className="text-xs">Work {duration(s.totals.workSeconds)} · Office {s.attendance.measuredOfficeSeconds===null?'awaiting attendance resolution':duration(s.attendance.measuredOfficeSeconds)} · Individual {duration(s.totals.individualSeconds)} · Pre-assignment {duration(s.totals.preAssignmentSeconds)} · Assigned {duration(s.totals.assignedSeconds)}</p>
        <p className="text-xs">Attendance {s.attendance.day?.attendanceStatus||s.attendance.day?.presenceState||s.attendance.status} · Personal Pause {duration(s.totals.personalPauseSeconds||0)} · Agenda attribution follows the recorded Yes/No decision. Candidate pre-assignment time is {s.includePreAssignment?'included in':'excluded from'} task totals</p></div><Button size="sm" variant="outline" onClick={()=>setExpanded(expanded===s._id?'':s._id)}>Timeline and screenshots</Button></div>
      {expanded===s._id&&<SessionTimeline session={s} timezone={data.timezone} filterKey={filterKey} />}
    </article>)}
    {data?.nextCursor&&<Button variant="outline" onClick={()=>load(data.nextCursor)}>More sessions</Button>}
  </section>;
}

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import WorkspaceContext from '../../context/WorkspaceContext';
import { getReports, getReportMembers, getTimeline, errorMessage } from '../../services/trackingApi';
import { formatTrackingClock as duration } from '../../utils/duration';
import { Button } from '../ui/button';
import ScreenshotGallery from './ScreenshotGallery';
import useTrackingScope from './useTrackingScope';
const style = { color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)' };
const dateTime = (value, timezone) => new Date(value).toLocaleString(undefined,{timeZone:timezone || 'UTC'});
const workTitle=s=>s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle} (origin: ${s.agendaTitle} — ${s.description})`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName} / ${s.taskTitle||'Individual'}`;
function SessionTimeline({session,timezone,filterKey}) {
  const [data,setData]=useState(null),[error,setError]=useState('');
  useEffect(()=>{let live=true;getTimeline(session._id,undefined,{...JSON.parse(filterKey),summaryOnly:true}).then(next=>live&&setData(next)).catch(e=>live&&setError(errorMessage(e)));return()=>{live=false;};},[session._id,filterKey,session.revision]);
  return <div className="mt-3 space-y-3 border-t pt-3" style={style}>
    <p className="text-xs">Times shown in {timezone}. Input counts measure interaction, not output or a productivity score.</p>
    {session.segments.map((s,i)=><p className="text-xs" key={s._id||i}>{workTitle(s)} · {dateTime(s.startedAt,timezone)} – {s.endedAt?dateTime(s.endedAt,timezone):'running'}{s.assignedAt?` · assigned ${dateTime(s.assignedAt,timezone)}`:''}{s.attributedAt?` · explicitly included ${dateTime(s.attributedAt,timezone)}`:''}</p>)}
    {error&&<p role="alert">{error}</p>}
    {data?.evidence && <div className="text-xs space-y-1"><p>Activity {data.evidence.activityPercent===null?'N/A':`${data.evidence.activityPercent.toFixed(1)}%`} · eligible input coverage {duration(data.evidence.eligibleInputSeconds)} · mouse presses {data.evidence.mouseCount??'N/A'} · keydowns {data.evidence.keyboardCount??'N/A'}</p><p>Uploaded capture windows {data.evidence.capturedWindows}/{data.evidence.eligibleWindows} · success {data.evidence.captureSuccessPercent===null?'N/A':`${data.evidence.captureSuccessPercent.toFixed(1)}%`} · images pending {data.evidence.pendingScreenshots}{data.evidence.provisional?' · provisional':''}</p><p>These totals cover recorded windows only. Missing agent periods remain unknown; monitor images do not multiply global counters.</p></div>}
    {(session.pauses||[]).map((p,i)=><p className="text-xs" key={`pause-${i}`}>Personal Pause · {dateTime(p.startedAt,timezone)} – {p.endedAt?dateTime(p.endedAt,timezone):'ongoing'}</p>)}
    {!!data?.coverageGaps?.length && <details><summary className="cursor-pointer text-sm">{data.coverageGaps.length} desktop coverage gaps (work time is preserved)</summary>{data.coverageGaps.map((gap,i)=><p className="text-xs" key={i}>{dateTime(gap.startedAt,timezone)} – {dateTime(gap.endedAt,timezone)}</p>)}</details>}
    {data&&!data.intervals.length&&<p className="text-sm">No desktop coverage uploaded for this session. Work and attendance time are still recorded.</p>}
    <ScreenshotGallery sessionId={session._id} timezone={timezone} filters={JSON.parse(filterKey)}/>
    <details><summary className="cursor-pointer text-sm">Immutable work history</summary>{(session.audit||[]).map(a=><p key={a.id} className="text-xs">{dateTime(a.at,timezone)} · {a.type}</p>)}</details>
  </div>;
}
export default function TrackingReports({team=false,initialFilters={}}) {
  const {currentWorkspace}=useContext(WorkspaceContext)||{};const workspaceId=currentWorkspace?._id;
  const requestVersion=useRef(0),scope=useTrackingScope();
  const [response,setData]=useState(null),[error,setError]=useState(''),[expanded,setExpanded]=useState('');
  const [fromDate,setFromDate]=useState(initialFilters.fromDate||''),[toDate,setToDate]=useState(initialFilters.toDate||''),[userId,setUserId]=useState(initialFilters.userId||'');
  const data=String(response?.workspaceId)===String(workspaceId)?response:null;
  const [members,setMembers]=useState([]);
  useEffect(()=>{if(team)getReportMembers().then(setMembers).catch(()=>{});},[team]);
  const filterKey=JSON.stringify(initialFilters);
  const load=useCallback(async cursor=>{if(!scope)return;const version=++requestVersion.current;try{const next=await getReports({...JSON.parse(filterKey),team,fromDate,toDate,userId:userId||undefined,cursor});if(String(next.workspaceId)!==String(workspaceId))return;if(version!==requestVersion.current)return;setData(old=>old?{...next,sessions:cursor?[...old.sessions,...next.sessions]:[...next.sessions,...old.sessions.filter(s=>!next.sessions.some(n=>n._id===s._id))],nextCursor:cursor?next.nextCursor:old.nextCursor}:next);setExpanded(old=>old||next.sessions[0]?._id||'');setError('');}catch(e){if(version===requestVersion.current){setData(null);setError(errorMessage(e));}}},[team,fromDate,toDate,userId,filterKey,workspaceId,scope]);
  useEffect(()=>{const version=requestVersion;load();return()=>{version.current++;};},[load]);
  useEffect(()=>{setData(null);setExpanded('');},[scope]);
  useEffect(()=>{let timer;const refresh=e=>{if(!/^(tracking:|attendance:)/.test(e.detail?.type||''))return;clearTimeout(timer);timer=setTimeout(()=>load(),750);};window.addEventListener('flowtask:realtime',refresh);return()=>{clearTimeout(timer);window.removeEventListener('flowtask:realtime',refresh);};},[load]);

  return <section className="rounded-2xl border p-5" style={style}>
    <h2 className="mb-3 text-base font-bold">{team?'Team daily timeline':'Daily work timeline'}</h2>
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

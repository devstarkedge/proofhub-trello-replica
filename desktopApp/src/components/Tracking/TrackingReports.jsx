import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import { useContext, useEffect, useMemo, useState } from 'react';
import WorkspaceContext from '../../context/WorkspaceContext';
import { getReports, getReportMembers, getTimeline, getWorkHistory, errorMessage } from '../../services/trackingApi';
import { formatTrackingClock as duration } from '../../utils/duration';
import { Button } from '../ui/button';
import ScreenshotGallery from './ScreenshotGallery';
import useTrackingScope from './useTrackingScope';
const style = { color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)' };
const dateTime = (value, timezone) => new Date(value).toLocaleString(undefined,{timeZone:timezone || 'UTC'});
const workTitle=s=>s.attributedTaskTitle?`${s.attributedProjectName} / ${s.attributedTaskTitle} (origin: ${s.agendaTitle} — ${s.description})`:s.agenda?`${s.agendaTitle} — ${s.description}`:`${s.projectName} / ${s.taskTitle||'Individual'}`;
function WorkHistory({sessionId,timezone}){
 const scope=useTrackingScope(),[open,setOpen]=useState(false);
 const query=useInfiniteQuery({queryKey:['tracking-private',scope,'work-history',sessionId],initialPageParam:0,enabled:open,queryFn:({pageParam,signal})=>getWorkHistory(sessionId,pageParam,signal),getNextPageParam:last=>last.nextOffset??undefined,staleTime:15000,retry:false});
 return <details onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm">Immutable work history</summary>{query.isPending&&open&&<p role="status">Loading history...</p>}{query.error&&<p role="alert">{errorMessage(query.error)}</p>}{query.data?.pages.flatMap(p=>p.events).map(a=><p key={a.id} className="text-xs">{dateTime(a.at,timezone)} - {a.type}</p>)}{query.hasNextPage&&<Button disabled={query.isFetchingNextPage} onClick={()=>query.fetchNextPage()}>More history</Button>}</details>;
}
function SessionTimeline({session,timezone,filterKey}) {
  const scope=useTrackingScope();
  const query=useQuery({queryKey:['tracking-private',scope,'timeline',session._id,session.revision,filterKey],queryFn:({signal})=>getTimeline(session._id,undefined,{...JSON.parse(filterKey),summaryOnly:true},signal),staleTime:15000,retry:false});
  const data=query.data,error=query.error?errorMessage(query.error):'';
  return <div className="mt-3 space-y-3 border-t pt-3" style={style}>
    <p className="text-xs">Times shown in {timezone}. Input counts measure interaction, not output or a productivity score.</p>
    {session.segments.map((s,i)=><p className="text-xs" key={s._id||i}>{workTitle(s)} · {dateTime(s.startedAt,timezone)} – {s.endedAt?dateTime(s.endedAt,timezone):'running'}{s.assignedAt?` · assigned ${dateTime(s.assignedAt,timezone)}`:''}{s.attributedAt?` · explicitly included ${dateTime(s.attributedAt,timezone)}`:''}</p>)}
    {query.isPending&&<p role="status">Loading work sessions...</p>}
    {error&&<p role="alert">{error}</p>}
    {data?.evidence && <div className="text-xs space-y-1"><p>Activity {data.evidence.activityPercent===null?'N/A':`${data.evidence.activityPercent.toFixed(1)}%`} · eligible input coverage {duration(data.evidence.eligibleInputSeconds)} · mouse presses {data.evidence.mouseCount??'N/A'} · keydowns {data.evidence.keyboardCount??'N/A'}</p><p>Uploaded capture windows {data.evidence.capturedWindows}/{data.evidence.eligibleWindows} · success {data.evidence.captureSuccessPercent===null?'N/A':`${data.evidence.captureSuccessPercent.toFixed(1)}%`} · images pending {data.evidence.pendingScreenshots}{data.evidence.provisional?' · provisional':''}</p><p>These totals cover recorded windows only. Missing agent periods remain unknown; monitor images do not multiply global counters.</p></div>}
    {(session.pauses||[]).map((p,i)=><p className="text-xs" key={`pause-${i}`}>Personal Pause · {dateTime(p.startedAt,timezone)} – {p.endedAt?dateTime(p.endedAt,timezone):'ongoing'}</p>)}
    {!!data?.coverageGaps?.length && <details><summary className="cursor-pointer text-sm">{data.coverageGaps.length} desktop coverage gaps (work time is preserved)</summary>{data.coverageGaps.map((gap,i)=><p className="text-xs" key={i}>{dateTime(gap.startedAt,timezone)} – {dateTime(gap.endedAt,timezone)}</p>)}</details>}
    {data&&!data.intervals.length&&<p className="text-sm">No desktop coverage uploaded for this session. Work and attendance time are still recorded.</p>}
    <ScreenshotGallery sessionId={session._id} timezone={timezone} filters={JSON.parse(filterKey)}/>
    <WorkHistory sessionId={session._id} timezone={timezone}/>
  </div>;
}
export default function TrackingReports({team=false,initialFilters={}}) {
  const {currentWorkspace}=useContext(WorkspaceContext)||{};const workspaceId=currentWorkspace?._id;
  const scope=useTrackingScope(),client=useQueryClient();
  const [expanded,setExpanded]=useState(''),[fromDate,setFromDate]=useState(initialFilters.fromDate||''),[toDate,setToDate]=useState(initialFilters.toDate||''),[userId,setUserId]=useState(initialFilters.userId||'');
  const filterKey=JSON.stringify(initialFilters),[members,setMembers]=useState([]);
  useEffect(()=>{const controller=new AbortController();if(team)getReportMembers(controller.signal).then(setMembers).catch(()=>{});return()=>controller.abort();},[team,scope]);
  const key=useMemo(()=>['tracking-private',scope,'reports',filterKey,team,fromDate,toDate,userId],[scope,filterKey,team,fromDate,toDate,userId]);
  const query=useInfiniteQuery({queryKey:key,initialPageParam:null,queryFn:({pageParam,signal})=>getReports({...JSON.parse(filterKey),team,fromDate,toDate,userId:userId||undefined,cursor:pageParam||undefined},signal),getNextPageParam:last=>last.nextCursor||undefined,staleTime:15000,gcTime:60000,retry:false,enabled:Boolean(workspaceId)});
  const data=useMemo(()=>!query.error&&query.data?{...query.data.pages[0],sessions:[...new Map(query.data.pages.flatMap(page=>page.sessions).map(session=>[session._id,session])).values()]}:null,[query.data,query.error]);
  const error=query.error?errorMessage(query.error):'';
  useEffect(()=>{setExpanded('');},[scope,filterKey,fromDate,toDate,userId]);
  useEffect(()=>{let timer;const refresh=e=>{if(!/^(tracking:|attendance:)/.test(e.detail?.type||''))return;clearTimeout(timer);timer=setTimeout(()=>client.invalidateQueries({queryKey:key}),250);};window.addEventListener('flowtask:realtime',refresh);return()=>{clearTimeout(timer);window.removeEventListener('flowtask:realtime',refresh);};},[client,key]);

  return <section className="rounded-2xl border p-5" style={style}>
    <h2 className="mb-3 text-base font-bold">{team?'Team daily timeline':'Daily work timeline'}</h2>
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><label>From <input aria-label="Work reports from" className="rounded border p-2" style={style} type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} /></label><label>To <input aria-label="Work reports to" className="rounded border p-2" style={style} type="date" value={toDate} onChange={e=>setToDate(e.target.value)} /></label>{team&&<label>Member <select className="rounded border p-2" style={style} value={userId} onChange={e=>setUserId(e.target.value)}><option value="">All authorized members</option>{members.map(member=><option value={member._id} key={member._id}>{member.name}</option>)}</select></label>}<Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}>Refresh</Button></div>
    {error&&<p role="alert" className="text-sm">{error}</p>}
    {query.isPending&&<p role="status">Loading work sessions...</p>}
    {data&&!data.sessions.length&&<p className="text-sm">No work sessions in this range.</p>}
    {data?.sessions.map(s=><article key={s._id} className="border-b py-3" style={style}>
      <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{s.workDateKey} · {workTitle(s.segments.at(-1)||{})} {team?`· ${s.userName || s.user}`:''}</p>
        <p className="text-xs">Work {duration(s.totals.workSeconds)} · Office {s.attendance.measuredOfficeSeconds===null?'awaiting attendance resolution':duration(s.attendance.measuredOfficeSeconds)} · Individual {duration(s.totals.individualSeconds)} · Pre-assignment {duration(s.totals.preAssignmentSeconds)} · Assigned {duration(s.totals.assignedSeconds)}</p>
        <p className="text-xs">Attendance {s.attendance.day?.attendanceStatus||s.attendance.day?.presenceState||s.attendance.status} · Personal Pause {duration(s.totals.personalPauseSeconds||0)} · Agenda attribution follows the recorded Yes/No decision. Candidate pre-assignment time is {s.includePreAssignment?'included in':'excluded from'} task totals</p></div><Button size="sm" variant="outline" onClick={()=>setExpanded(expanded===s._id?'':s._id)}>Timeline and screenshots</Button></div>
      {expanded===s._id&&<SessionTimeline session={s} timezone={data.timezone} filterKey={filterKey} />}
    </article>)}
    {data?.nextCursor&&<Button variant="outline" disabled={query.isFetchingNextPage} onClick={()=>query.fetchNextPage()}>More sessions</Button>}
  </section>;
}

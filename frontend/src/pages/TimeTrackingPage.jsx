import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {getTrackingDashboard,getWorkOptions,getAgendas,errorMessage} from '../services/trackingApi';
import WorkspaceContext from '../context/WorkspaceContext';
import Avatar from '../components/Avatar';
import TrackingPanel from '../components/Tracking/TrackingPanel';
import TrackingReports from '../components/Tracking/TrackingReports';
import {formatTrackingClock as duration} from '../utils/duration';
import {Button} from '../components/ui/button';
import {useInfiniteQuery,useQueryClient} from '@tanstack/react-query';
import useTrackingScope from '../components/Tracking/useTrackingScope';
import {summarizeDesktopDevices} from '../services/desktopTracking';
const style={backgroundColor:'var(--color-card-bg)',color:'var(--color-text-primary)',borderColor:'var(--color-border-default)'};
const initial={period:'today',type:'',projectId:'',taskId:'',departmentId:'',role:'',status:'',userId:'',search:'',agendaId:'',description:'',linked:'',fromDate:'',toDate:'',page:1};
function AgentStatus({user}){
  const agent=summarizeDesktopDevices(user.devices,user.session?._id);
  return <>{agent.connected?'Connected':user.devices.length?'Connection Offline':'Agent unavailable'}{user.trackingStatus==='RUNNING'&&agent.needsAttention&&<p className="text-red-600">Attention Required</p>}{user.devices.some(d=>d.screenshotIssue)&&<p className="text-xs text-amber-600">{user.devices.find(d=>d.screenshotIssue).screenshotIssue}</p>}<p className="text-xs">Last seen {agent.lastSeenAt?new Date(agent.lastSeenAt).toLocaleString():'unknown'}</p></>;
}
export default function TimeTrackingPage(){
  const {currentWorkspace}=useContext(WorkspaceContext)||{};const workspaceId=currentWorkspace?._id;
  const [filters,setFilters]=useState(initial),[selected,setSelected]=useState(null),[projects,setProjects]=useState([]),[tasks,setTasks]=useState([]),[agendas,setAgendas]=useState([]),[debounced,setDebounced]=useState(filters);
  const scope=useTrackingScope(),sentinel=useRef(null),client=useQueryClient();
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(filters),300);return()=>clearTimeout(timer);},[filters]);
  const query=useInfiniteQuery({queryKey:['tracking-private',scope,'dashboard',debounced],initialPageParam:null,queryFn:({pageParam,signal})=>getTrackingDashboard({...debounced,cursor:pageParam||undefined},signal),getNextPageParam:last=>last.nextCursor||undefined,staleTime:30000,gcTime:0,retry:false});
  useEffect(()=>{const controller=new AbortController();let timer;const refresh=e=>{if(e&&!/^(tracking:|attendance:)/.test(e.detail?.type||''))return;clearTimeout(timer);timer=setTimeout(()=>{getTrackingDashboard(debounced,controller.signal).then(next=>client.setQueryData(['tracking-private',scope,'dashboard',debounced],old=>old?{...old,pages:[next,...old.pages.slice(1)]}:old)).catch(()=>{});},750);};window.addEventListener('flowtask:realtime',refresh);const poll=setInterval(()=>refresh(),60000);return()=>{controller.abort();clearTimeout(timer);clearInterval(poll);window.removeEventListener('flowtask:realtime',refresh);};},[scope,debounced,client]);
  const data=useMemo(()=>{if(!query.data)return null;return {...query.data.pages[0],users:[...new Map(query.data.pages.flatMap(p=>p.users).map(u=>[u.userId,u])).values()]};},[query.data]);
  const error=query.error?errorMessage(query.error):'';
  useEffect(()=>{setSelected(null);},[scope]);
  const {hasNextPage,isFetchingNextPage,isError,fetchNextPage}=query;
  useEffect(()=>{if(!hasNextPage||isFetchingNextPage||isError)return;const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))fetchNextPage();},{rootMargin:'100px'});observer.observe(sentinel.current);return()=>observer.disconnect();},[hasNextPage,isFetchingNextPage,isError,fetchNextPage]);
  useEffect(()=>{let live=true;setSelected(null);setProjects([]);setAgendas([]);getWorkOptions().then(next=>live&&setProjects(next.projects)).catch(()=>{});getAgendas().then(next=>live&&setAgendas(next)).catch(()=>{});return()=>{live=false;};},[workspaceId]);
  useEffect(()=>{let live=true;setTasks([]);if(!filters.projectId)return;getWorkOptions(filters.projectId).then(next=>live&&setTasks(next.tasks)).catch(()=>{});return()=>{live=false;};},[filters.projectId,workspaceId]);
  const change=(key,value)=>{setSelected(null);setFilters({...filters,[key]:value,page:1});};
  const selectedUser=data?.users.find(u=>u.userId===selected?.userId);
  const choices=[['Time period','period',[['today','Today'],['yesterday','Yesterday'],['week','This Week'],['month','This Month'],['custom','Custom date range']]],['Tracking type','type',[['TASK','Assigned task'],['INDIVIDUAL','Individual agenda']]],['Project','projectId',projects.map(p=>[p._id,p.name])],['Task','taskId',tasks.map(t=>[t._id,t.title])],['Department','departmentId',[...new Map((data?.users||[]).flatMap(u=>u.departments).map(d=>[d._id,[d._id,d.name]])).values()]],['Role','role',[...new Set(['admin','manager','employee',...(data?.users||[]).map(u=>u.role)])].map(role=>[role,role])],['Tracking status','status',[['RUNNING','Actively Tracking'],['PAUSED','Personal Pause'],['NOT_TRACKING','Not Tracking']]],['Specific user','userId',(data?.users||[]).map(u=>[u.userId,u.name])],['Agenda','agendaId',agendas.map(a=>[a._id,a.title])],['Attribution','linked',[['true','Linked'],['false','Separate']]]];
  return <main className="space-y-5 p-4 lg:p-7" style={{color:'var(--color-text-primary)'}}>
    <h1 className="text-2xl font-bold">Time Tracking</h1><p>Live work, attendance, agendas, and monitoring coverage. Input activity measures interaction, not work quality.</p>
    <TrackingPanel/>
    <section className="rounded-2xl border p-5 space-y-4" style={style}><div className="flex justify-between"><h2 className="font-bold">Workspace tracking activity</h2><Button variant="outline" onClick={()=>setFilters(initial)}>Clear Filters</Button></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{choices.map(([label,key,items])=><label key={key} className="text-xs">{label}<select aria-label={label} className="block w-full rounded border p-2 text-sm" style={style} value={filters[key]} onChange={e=>change(key,e.target.value)}><option value="">{key==='period'?'Today':'All'}</option>{items.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>)}
        {filters.period==='custom'&&['fromDate','toDate'].map(key=><label key={key}>{key==='fromDate'?'From':'To'}<input className="block rounded border p-2" style={style} type="date" value={filters[key]} onChange={e=>change(key,e.target.value)}/></label>)}
        {[['search','Search authorized user'],['description','Agenda description']].map(([key,label])=><label key={key} className="text-xs">{label}<input aria-label={label} className="block w-full rounded border p-2" style={style} value={filters[key]} onChange={e=>change(key,e.target.value)}/></label>)}
      </div>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p role="status">Loading authorized records…</p>}{data&&<p className="text-xs">{data.total} authorized users · dates in {data.timezone}</p>}
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['User / departments','Attendance','Tracking context','Work / office','Agent / sync','Activity','Details'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data?.users.map(u=><tr key={u.userId} className="border-t" style={style}>
        <td className="p-3"><div className="flex items-center gap-2"><Avatar src={u.avatar} name={u.name} role={u.role} size="sm"/><p className="font-semibold">{u.name}</p></div><p className="text-xs">{u.role} · {u.departments.map(d=>d.name).join(', ')}</p></td><td className="p-3">{u.attendanceStatus}</td>
        <td className="p-3"><span className={u.trackingStatus==='RUNNING'?'text-green-600':u.trackingStatus==='PAUSED'?'text-amber-600':'text-gray-500'}>{u.trackingStatus==='RUNNING'?'● Actively Tracking':u.trackingStatus==='PAUSED'?'● Personal Pause':'● Not Tracking'}</span><p className="text-xs">{u.title}</p></td>
        <td className="p-3 tabular-nums">{duration(u.workSeconds)} / {duration(u.officeSeconds)}</td><td className="p-3"><AgentStatus user={u}/></td>
        <td className="p-3">{u.evidence.activityPercent===null?'N/A':`${u.evidence.activityPercent.toFixed(1)}%`}<p className="text-xs">Keys {u.evidence.keyboardCount??'N/A'} · Mouse {u.evidence.mouseCount??'N/A'} · Captures {u.evidence.capturedWindows}/{u.evidence.eligibleWindows} · Pending {u.evidence.pendingScreenshots}</p></td><td className="p-3"><Button size="sm" variant="outline" onClick={()=>setSelected(u)}>Open</Button></td>
      </tr>)}</tbody></table></div>{data&&!data.users.length&&<p>No authorized users match.</p>}
      <div ref={sentinel} className="flex min-h-8 justify-center">{query.isFetchingNextPage?<p role="status">Loading more users…</p>:query.hasNextPage&&<Button variant="outline" onClick={()=>query.fetchNextPage()}>Load 20 more users</Button>}</div>
    </section>
    {selectedUser&&data&&<section role="dialog" aria-modal="true" aria-label={`${selectedUser.name} tracking details`} className="fixed inset-y-0 right-0 z-50 w-full max-w-4xl overflow-auto border-l p-5 shadow-xl space-y-4" style={style}><div className="flex justify-between"><h2 className="font-bold">{selectedUser.name} tracking details</h2><Button variant="outline" onClick={()=>setSelected(null)}>Close</Button></div><p>{selectedUser.title} · Work {duration(selectedUser.workSeconds)} · Office {duration(selectedUser.officeSeconds)}</p><div className="flex gap-3 flex-wrap">{choices.filter(([,key])=>['type','projectId','taskId','agendaId'].includes(key)).map(([label,key,items])=><label key={key} className="text-xs">{label}<select aria-label={`Detail ${label}`} className="block rounded border p-2" style={style} value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value,page:1})}><option value="">All</option>{items.map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>)}</div><TrackingReports key={scope+JSON.stringify(filters)+selectedUser.userId} initialFilters={{...filters,userId:selectedUser.userId,fromDate:data.dates.fromDate,toDate:data.dates.toDate}}/></section>}
  </main>;
}

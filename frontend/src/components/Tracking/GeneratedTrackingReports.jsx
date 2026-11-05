import { useDebounce } from '../../hooks/useDebounce';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileSpreadsheet, Loader2, Mail, Trash2, Eye } from 'lucide-react';
import { addDays, endOfMonth, format, parseISO } from 'date-fns';
import api from '../../services/api';
import AuthContext from '../../context/AuthContext';
import TrackingDialog from './TrackingDialog';
import useTrackingScope from './useTrackingScope';

const initial = () => ({period:'weekly',startDate:new Date().toISOString().slice(0,10),month:new Date().toISOString().slice(0,7),departmentId:'',userId:'',projectId:'',taskId:'',status:'',method:'download',emails:''});
const readableError = error => error?.response?.data?.message || error?.message || 'Please try again.';
const clock = seconds => `${Math.floor(seconds/3600)}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
const control='w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100';
const action='inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium disabled:opacity-50';
export default function GeneratedTrackingReports() {
  const {user}=useContext(AuthContext)||{},scope=useTrackingScope();
  if(user?.isSuperAdmin || !['admin','hr','manager'].includes(user?.role))return null;
  return <ReportSection key={scope} scope={scope}/>;
}
function ReportSection({scope}) {
  const queryClient=useQueryClient(),[open,setOpen]=useState(false),[form,setForm]=useState(initial),[error,setError]=useState(''),[view,setView]=useState(null),[page,setPage]=useState(1),[busy,setBusy]=useState(''),[autoDownload,setAutoDownload]=useState('');
  const [search,setSearch]=useState({userSearch:'',projectSearch:'',taskSearch:''}),delayedSearch=useDebounce(search,400);
  const live=useRef(true),scopeRef=useRef(scope),attempt=useRef(null);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const options=useQuery({queryKey:['generated-report-options',scope,form.departmentId,form.projectId,delayedSearch],queryFn:async({signal})=>(await api.get('/api/tracking/generated-reports/options',{params:{departmentId:form.departmentId,projectId:form.projectId,...delayedSearch},signal})).data.data,retry:false,staleTime:15000,placeholderData:previous=>previous});
  const list=useQuery({queryKey:['generated-reports',scope],enabled:open&&!!options.data,queryFn:async({signal})=>(await api.get('/api/tracking/generated-reports',{signal})).data.data,refetchInterval:query=>query.state.data?.some(row=>['QUEUED','PROCESSING'].includes(row.status)||['PENDING','SENDING'].includes(row.emailStatus))?3000:false});
  const detail=useQuery({queryKey:['generated-report-detail',scope,view,page],enabled:!!view,queryFn:async({signal})=>(await api.get(`/api/tracking/generated-reports/${view}`,{params:{page},signal})).data.data});
  const invalidate=()=>queryClient.invalidateQueries({queryKey:['generated-reports',scope]});
  const generation=useMutation({mutationFn:async request=>{
    return (await api.post('/api/tracking/generated-reports',request,{skipOfflineQueue:true,timeout:15000})).data.data;
  },onSuccess:(row,request)=>{attempt.current=null;setError('');if(request.method==='download')setAutoDownload(row._id);void invalidate();},onError:error=>setError(readableError(error))});
  const download = useCallback(async row => {
    setBusy(row._id);setError('');
    try {
      const result=await api.get(`/api/tracking/generated-reports/${row._id}/download`,{responseType:'blob'});
      if(!live.current||scopeRef.current!==scope)return;
      const url=URL.createObjectURL(result.data),anchor=document.createElement('a');anchor.href=url;anchor.download=`flowtask-${row.filters.period}-${row.filters.startDate}.xlsx`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){if(live.current)setError(error.response?.data instanceof Blob ? (await error.response.data.json().catch(()=>({}))).message || 'Download failed. Try again.' : readableError(error));}
    finally{if(live.current)setBusy('');}
  },[scope]);
  useEffect(()=>{
    const row=list.data?.find(row=>row._id===autoDownload);
    if(row&&['READY','EMPTY'].includes(row.status)){setAutoDownload('');void download(row);}
    else if(row?.status==='FAILED')setAutoDownload('');
  },[list.data,autoDownload,download]);
  async function remove(row) {
    setBusy(row._id);setError('');try{await api.delete(`/api/tracking/generated-reports/${row._id}`,{skipOfflineQueue:true});await invalidate();}catch(error){setError(readableError(error));}finally{setBusy('');}
  }
  async function emailAgain(row) {
    setBusy(row._id);setError('');try{await api.post(`/api/tracking/generated-reports/${row._id}/email`,{recipients:row.recipients,confirmUnknown:row.emailStatus==='UNKNOWN'},{skipOfflineQueue:true});await invalidate();}catch(error){setError(readableError(error));}finally{setBusy('');}
  }
  const change=(field,value)=>{setForm(previous=>({...previous,[field]:value,...(field==='departmentId'?{userId:'',projectId:'',taskId:''}:field==='projectId'?{taskId:''}:{})}));setError('');};
  const select=(label,field,records,empty)=> <label className="space-y-1 text-sm font-medium">{label}<select aria-label={label} disabled={options.isFetching} className={control} value={form[field]} onChange={event=>change(field,event.target.value)}><option value="">{empty}</option>{records?.map(record=><option key={record._id} value={record._id}>{record.name||record.title}</option>)}</select></label>;
  const searchInput=(label,field,selection)=> <input aria-label={label} placeholder={label} className={control} maxLength={80} value={search[field]} onChange={event=>{setSearch(previous=>({...previous,[field]:event.target.value}));change(selection,'');}}/>;
  if(options.error?.response?.status===403)return null;
  const end=form.period==='weekly'?form.startDate ? format(addDays(parseISO(form.startDate),6),'yyyy-MM-dd') : '—' : form.month ? format(endOfMonth(parseISO(`${form.month}-01`)),'yyyy-MM-dd') : '—';
  return <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-5 space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Reports</h2><p className="text-sm text-gray-500">Weekly and monthly time tracking reports</p></div><button className={`${action} bg-indigo-600 text-white`} disabled={!options.data} onClick={()=>setOpen(value=>!value)}><FileSpreadsheet size={16}/>{open?'Close reports':'Reports / Export'}</button></div>
    {options.error&&<p role="alert" className="text-sm text-red-600">{readableError(options.error)} <button onClick={()=>options.refetch()} className="underline">Retry</button></p>}
    {open&&options.data&&<>
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={event=>{event.preventDefault();const signature=JSON.stringify(form);if(attempt.current?.signature!==signature)attempt.current={signature,id:crypto.randomUUID()};generation.mutate({...form,operationId:attempt.current.id,recipients:form.emails.split(',').map(value=>value.trim()).filter(Boolean)});}}>
        <label className="space-y-1 text-sm font-medium">Reporting period<select className={control} value={form.period} onChange={event=>change('period',event.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        {form.period==='weekly'?<label className="space-y-1 text-sm font-medium">Start date<input required type="date" className={control} value={form.startDate} onChange={event=>change('startDate',event.target.value)}/></label>:<label className="space-y-1 text-sm font-medium">Reporting month<input required type="month" className={control} value={form.month} onChange={event=>change('month',event.target.value)}/></label>}
        <div className="text-sm self-end py-2">Through {end || '—'} · {options.data.timezone}</div>
        {select('Department','departmentId',options.data.departments,'All authorized departments')}
        <div className="space-y-2">{select('Employee','userId',options.data.users,'All authorized employees')}{searchInput('Find employee','userSearch','userId')}</div>
        <div className="space-y-2">{select('Project','projectId',options.data.projects,'All projects')}{searchInput('Find project','projectSearch','projectId')}</div>
        {form.projectId&&<div className="space-y-2">{select('Task','taskId',options.data.tasks,'All tasks')}{searchInput('Find task','taskSearch','taskId')}</div>}
        <label className="space-y-1 text-sm font-medium">Tracking status<select className={control} value={form.status} onChange={event=>change('status',event.target.value)}><option value="">All statuses</option><option value="RUNNING">Running</option><option value="PAUSED">Paused</option><option value="CLOSED">Closed</option></select></label>
        <label className="space-y-1 text-sm font-medium">Export method<select className={control} value={form.method} onChange={event=>change('method',event.target.value)}><option value="download">Download Excel (.xlsx)</option><option value="email">Send Excel via email</option></select></label>
        {form.method==='email'&&<label className="space-y-1 text-sm font-medium sm:col-span-2">Recipient emails<input required type="email" multiple className={control} placeholder="name@company.com, colleague@company.com" value={form.emails} onChange={event=>change('emails',event.target.value)}/><span className="block text-xs text-gray-500">External recipients require the existing export permission.</span></label>}
        <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3"><button type="submit" disabled={generation.isPending||options.isFetching} className={`${action} bg-indigo-600 text-white`}>{generation.isPending?<Loader2 size={16} className="animate-spin"/>:<FileSpreadsheet size={16}/>} {generation.isPending?'Submitting...':'Generate report'}</button><span className="text-xs text-gray-500">Runs in the background. Up to 10 reports are retained for 14 days. Large selections may need narrower filters.</span></div>
      </form>
      {options.data.optionsLimited&&<p className="text-xs text-amber-700">Up to 500 matches are listed. Search by name or select a department to narrow the options.</p>}
      {(error||list.error)&&<p role="alert" className="text-sm text-red-600">{error||readableError(list.error)}</p>}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-4"><h3 className="font-semibold mb-3">Generated reports</h3>
        {list.isPending?<p className="text-sm text-gray-500" role="status">Loading reports...</p>:!list.data?.length?<p className="text-sm text-gray-500">No reports generated for your current access scope.</p>:<div className="space-y-3">{list.data.map(row=><article key={row._id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center justify-between gap-3"><div className="space-y-1"><p className="font-medium">{row.name}</p><p className="text-xs text-gray-500">{row.filters.startDate} to {row.filters.endDate} · {row.generatedBy} · {new Date(row.createdAt).toLocaleString()}</p><p className="text-sm">{['QUEUED','PROCESSING'].includes(row.status)&&<Loader2 size={14} className="inline animate-spin mr-1"/>}{row.status==='READY'?`${clock(row.totalSeconds)} tracked · ${row.sessionCount} sessions`:row.status==='EMPTY'?'No matching tracking records':row.status==='FAILED'?row.error:row.status==='QUEUED'?'Queued':'Generating report...'}</p>{row.emailStatus!=='NONE'&&<p className={`text-xs ${['FAILED','UNKNOWN'].includes(row.emailStatus)?'text-red-600':'text-gray-500'}`}>Email: {row.emailStatus.toLowerCase()}{row.emailError?` · ${row.emailError}`:''}</p>}</div><div className="flex flex-wrap gap-2">
          {['READY','EMPTY'].includes(row.status)&&<><button className={action} disabled={!!busy} onClick={()=>{setView(row._id);setPage(1);}}><Eye size={14}/>View</button><button className={action} disabled={!!busy} onClick={()=>download(row)}>{busy===row._id?<Loader2 size={14} className="animate-spin"/>:<Download size={14}/>}Download</button></>}
          {['FAILED','UNKNOWN'].includes(row.emailStatus)&&<button className={action} disabled={!!busy} onClick={()=>emailAgain(row)}><Mail size={14}/>{row.emailStatus==='UNKNOWN'?'Send another copy':'Retry email'}</button>}
          {!row.active&&row.emailStatus!=='SENDING'&&<button aria-label={`Delete ${row.name}`} className={action} disabled={!!busy} onClick={()=>remove(row)}><Trash2 size={14}/></button>}
        </div></article>)}</div>}
      </div>
    </>}
    {view&&<TrackingDialog title="Time tracking report" drawer onClose={()=>setView(null)}>{detail.isPending?<p role="status">Loading report...</p>:detail.error?<p role="alert">{readableError(detail.error)}</p>:<div className="space-y-4"><p className="font-semibold">{detail.data.name}</p><p className="text-sm text-gray-500">{detail.data.filters.startDate} to {detail.data.filters.endDate} · {detail.data.filters.timezone} · {clock(detail.data.totalSeconds||0)} total</p><div className="overflow-auto"><table className="w-full text-sm text-left"><thead><tr>{['Employee','Department','Date','Project','Task','Tracked','Sessions'].map(title=><th key={title} className="p-2 border-b">{title}</th>)}</tr></thead><tbody>{detail.data.details.map((row,index)=><tr key={index}>{[row.employee,row.department,row.date,row.project,row.task,clock(row.seconds),row.sessions].map((value,index)=><td key={index} className="p-2 border-b align-top">{value}</td>)}</tr>)}</tbody></table>{!detail.data.details.length&&<p className="py-4">No matching tracking records.</p>}</div><div className="flex gap-3 items-center"><button className={action} disabled={page===1} onClick={()=>setPage(value=>value-1)}>Previous</button><span className="text-sm">Page {page} of {detail.data.pages}</span><button className={action} disabled={page>=detail.data.pages} onClick={()=>setPage(value=>value+1)}>Next</button><button className={action} disabled={!!busy} onClick={()=>download(detail.data)}><Download size={14}/>Download</button></div></div>}</TrackingDialog>}
  </section>;
}

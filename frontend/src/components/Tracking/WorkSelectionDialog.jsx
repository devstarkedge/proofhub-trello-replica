import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {toast} from 'react-toastify';
import {getWorkOptions,getAgendas,createAgenda,createWorkTask,errorMessage} from '../../services/trackingApi';
import {Button} from '../ui/button';
import {formatTrackingClock} from '../../utils/duration';
const style={color:'var(--color-text-primary)',backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)'};
const field='block w-full rounded-lg border p-2 mt-1';
export default function WorkSelectionDialog({onClose,onConfirm,checkingIn=false,linking=false,currentSession=null,attendanceOnly=false,workModeControl=null}){
  const [mode,setMode]=useState('ASSIGNED'),[options,setOptions]=useState({projects:[],tasks:[],lists:[]}),[agendas,setAgendas]=useState([]),[agendaId,setAgendaId]=useState(''),[projectId,setProjectId]=useState(''),[taskId,setTaskId]=useState(''),[listId,setListId]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[agendaTitle,setAgendaTitle]=useState(''),[creatingAgenda,setCreatingAgenda]=useState(false),[includePrevious,setIncludePrevious]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const operation=useRef(crypto.randomUUID()),creation=useRef(crypto.randomUUID()),heading=useRef(null),saving=useRef(false);
  useEffect(()=>{if(attendanceOnly)return;let live=true;Promise.all([getWorkOptions(),getAgendas()]).then(([next,items])=>{if(!live)return;setOptions(next);setAgendas(items);setAgendaId(items.find(a=>a.title==='Learning')?._id||items[0]?._id||'');const first=next.projects.find(p=>p.hasAssignedTasks);setProjectId(first?._id||'');if(!first&&!linking)setMode('INDIVIDUAL');}).catch(e=>live&&setError(errorMessage(e)));return()=>{live=false;};},[linking,attendanceOnly]);
  useEffect(()=>{const before=document.activeElement;heading.current?.focus();return()=>before?.focus?.();},[]);
  useEffect(()=>{if(!projectId)return;let live=true;getWorkOptions(projectId).then(next=>{if(live){setOptions(next);setTaskId('');setListId(next.lists[0]?._id||'');}}).catch(e=>live&&setError(errorMessage(e)));return()=>{live=false;};},[projectId]);
  const project=options.projects.find(p=>p._id===projectId),last=currentSession?.segments.at(-1);
  const needsDecision=linking||Boolean(last?.agenda&&mode!=='INDIVIDUAL');
  let rangeStart=last?.startedAt,rangeSeconds=last?Math.max(0,((last.endedAt?+new Date(last.endedAt):Date.now())-+new Date(last.startedAt))/1000):0;
  for(let i=(currentSession?.segments.length||0)-2;i>=0;i--){const s=currentSession.segments[i];if(!last?.agenda||s.agenda!==last.agenda||s.description!==last.description||+new Date(s.endedAt)!==+new Date(rangeStart))break;rangeSeconds+=(+new Date(s.endedAt)-+new Date(s.startedAt))/1000;rangeStart=s.startedAt;}
  const valid=mode==='INDIVIDUAL'?agendaId&&description.trim():project&&(mode==='CREATE'?project.canCreate&&listId&&title.trim():taskId);
  const confirm=async(onlyAttendance=false)=>{if(saving.current)return;saving.current=true;setBusy(true);setError('');try{
    if(onlyAttendance){if(await onConfirm(null,operation.current)!==false)onClose();return;}
    let selection=mode==='INDIVIDUAL'?{mode,agendaId,description}:{mode:'ASSIGNED',projectId,taskId};
    if(mode==='CREATE'){
      try{const created=await createWorkTask({projectId,listId,title,description,operationId:creation.current});selection.taskId=created._id;}
      catch(error){if(!checkingIn)throw error;if(await onConfirm(null,operation.current)!==false){toast.warning(`Attendance is checked in. Task creation failed: ${errorMessage(error)}. Use Start work to retry.`);onClose();}return;}
    }
    if(needsDecision)selection.includePrevious=includePrevious;
    if(await onConfirm(selection,operation.current)!==false)onClose();
  }catch(e){setError(errorMessage(e));}finally{saving.current=false;setBusy(false);}};
  const requestClose=()=>{if(!busy&&!saving.current)onClose();};
  const keyDown=e=>{if(e.key==='Escape')requestClose();if(e.key==='Tab'){const nodes=[...e.currentTarget.querySelectorAll('button:not([disabled]),input,select,textarea')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  return createPortal(<div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4" onKeyDown={keyDown}><section role="dialog" aria-modal="true" aria-labelledby="work-selection-title" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-2xl border p-6 space-y-4" style={style}>
    <div className="flex justify-between gap-3"><h2 ref={heading} tabIndex={-1} id="work-selection-title" className="font-bold text-lg">{linking?'Link agenda to a task':checkingIn?(attendanceOnly?'Check In':'Check In + Work Selection'):'Choose your work'}</h2><button aria-label="Close work selection" disabled={busy} onClick={requestClose}>✕</button></div>
    {checkingIn&&workModeControl&&<div className="welcome-check-in-mode">{workModeControl}</div>}
    {!attendanceOnly&&<>
    <div className="flex flex-wrap gap-2">{[['ASSIGNED','Assigned Task'],['CREATE','Create Task'],['INDIVIDUAL','Individual Work']].filter(([key])=>(!linking||key!=='INDIVIDUAL')&&(key!=='CREATE'||options.canCreateTasks)).map(([key,label])=><Button key={key} variant={mode===key?'default':'outline'} disabled={busy} onClick={()=>setMode(key)}>{label}</Button>)}</div>
    {mode==='INDIVIDUAL'?<>
      <label>Agenda<select aria-label="Agenda" className={field} style={style} value={agendaId} onChange={e=>{if(e.target.value==='new'){setCreatingAgenda(true);return;}setAgendaId(e.target.value);}}><option value="">Choose agenda</option>{agendas.map(a=><option key={a._id} value={a._id}>{a.title}</option>)}<option value="new">+ Create New Agenda</option></select></label>
      {creatingAgenda&&<div className="rounded border p-3 space-y-2" style={style}><label>New agenda title<input aria-label="New agenda title" className={field} style={style} maxLength={80} value={agendaTitle} onChange={e=>setAgendaTitle(e.target.value)}/></label><Button disabled={busy||!agendaTitle.trim()} onClick={async()=>{setBusy(true);try{const next=await createAgenda(agendaTitle);const items=await getAgendas();setAgendas(items);setAgendaId(next._id);setCreatingAgenda(false);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}>Create Agenda</Button><Button variant="outline" onClick={()=>setCreatingAgenda(false)}>Cancel</Button></div>}
      <label>What are you working on?<textarea aria-label="What are you working on?" className={field} style={style} maxLength={1000} required value={description} onChange={e=>setDescription(e.target.value)}/></label>
    </>:<>
      <label>Project<select aria-label="Project" className={field} style={style} value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">Choose project</option><optgroup label="Projects with tasks assigned to you">{options.projects.filter(p=>p.hasAssignedTasks).map(p=><option value={p._id} key={p._id}>{p.name}</option>)}</optgroup>{mode==='CREATE'&&<optgroup label="Other accessible projects">{options.projects.filter(p=>!p.hasAssignedTasks).map(p=><option value={p._id} key={p._id}>{p.name}</option>)}</optgroup>}</select></label>
      {mode==='CREATE'?<><label>Task title<input className={field} style={style} maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Project list<select className={field} style={style} value={listId} onChange={e=>setListId(e.target.value)}>{options.lists.map(l=><option key={l._id} value={l._id}>{l.title}</option>)}</select></label><label>Description (optional)<textarea className={field} style={style} value={description} onChange={e=>setDescription(e.target.value)}/></label></>:<label>Assigned task<select aria-label="Task" className={field} style={style} value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">Choose assigned task</option>{options.tasks.filter(t=>t.assigned).map(t=><option key={t._id} value={t._id}>{t.title}</option>)}</select></label>}
    </>}
    {needsDecision&&<fieldset className="rounded-lg border p-3 space-y-2" style={style}><legend>Include previous work?</legend><p className="text-sm">{last?.agendaTitle||'Individual work'} — {last?.description||last?.projectName}</p><p className="text-xs">Affected period: {rangeStart&&new Date(rangeStart).toLocaleString()} to now · {formatTrackingClock(rangeSeconds)}. Breaks and unrelated work remain separate.</p><p>Do you want to include your previous Individual Agenda tracking time and screenshots in the selected task?</p>{[[true,'Yes — Include Previous Work'],[false,'No — Keep Previous Work Separate']].map(([value,label])=><label key={label} className="block"><input type="radio" name="attribution" checked={includePrevious===value} onChange={()=>setIncludePrevious(value)}/> {label}</label>)}</fieldset>}
    </>}
    {error&&<p role="alert" className="rounded bg-red-500/10 p-3 text-red-600">{error}</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={requestClose}>Cancel</Button>{checkingIn&&<Button variant={attendanceOnly?'default':'outline'} disabled={busy} onClick={()=>confirm(true)}>{busy&&attendanceOnly?'Checking In…':'Check In Only'}</Button>}{!attendanceOnly&&<Button disabled={busy||!valid||needsDecision&&includePrevious===null} onClick={()=>confirm()}>{busy?'Saving…':checkingIn?'Check In and Start Tracking':needsDecision?'Confirm transition':'Start Tracking'}</Button>}</div>
  </section></div>,document.body);
}

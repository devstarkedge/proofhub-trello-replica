import {useContext,useEffect,useState} from 'react';
import WorkspaceContext from '../../context/WorkspaceContext';
import {getTaskTrackedTime} from '../../services/trackingApi';
import {formatTrackingClock as duration} from '../../utils/duration';
export default function TaskLiveTimeSummary({taskId}){
  const {currentWorkspace}=useContext(WorkspaceContext)||{};
  const workspaceId=currentWorkspace?._id;
  const [data,setData]=useState(null);
  useEffect(()=>{let active=true;const refresh=()=>getTaskTrackedTime(taskId).then(next=>{if(active)setData(next);}).catch(()=>{if(active)setData(null);});
    refresh();const timer=setInterval(refresh,15000);
    const onEvent=event=>{if(event.detail?.type==='tracking:changed')refresh();};window.addEventListener('flowtask:realtime',onEvent);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('flowtask:realtime',onEvent);};
  },[taskId,workspaceId]);
  if(!data||String(data.workspaceId)!==String(workspaceId))return null;
  return <div className="mb-3 rounded-xl border p-3 text-sm" style={{backgroundColor:'var(--color-card-bg)',borderColor:'var(--color-border-default)',color:'var(--color-text-primary)'}}>
    <p className="font-semibold">Live tracked task time: {duration(data.trackedSeconds)}</p>
    <p className="text-xs">Assigned {duration(data.assignedSeconds)} · Individual before assignment {duration(data.preAssignmentSeconds)} ({duration(data.preAssignmentIncludedSeconds)} included under workspace policy)</p>
    <p className="mt-1 text-xs">These session records are separate from manually entered time below.</p>
  </div>;
}

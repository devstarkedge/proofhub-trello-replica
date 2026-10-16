import {useContext,useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import WorkspaceContext from '../../context/WorkspaceContext';
import AuthContext from '../../context/AuthContext';
export default function useTrackingScope(){
  const {currentWorkspace}=useContext(WorkspaceContext)||{}, {user}=useContext(AuthContext)||{};
  const [epoch,setEpoch]=useState(0),client=useQueryClient();
  useEffect(()=>{
    const clear=()=>{client.cancelQueries({queryKey:['tracking-private']});client.removeQueries({queryKey:['tracking-private']});setEpoch(e=>e+1);};
    const changed=e=>{if(/role|permission|department|membership|access|workspace.*updated|board.*updated|realtime-recover/.test(e.detail?.type||''))clear();};
    window.addEventListener('flowtask:realtime',changed);
    const events=['socket-disconnected','socket-connected','socket-auth-expired','socket-workspace-rejected'];events.forEach(t=>window.addEventListener(t,clear));
    return()=>{window.removeEventListener('flowtask:realtime',changed);events.forEach(t=>window.removeEventListener(t,clear));};
  },[client]);
  return [currentWorkspace?._id||'',user?._id||user?.id||'',epoch].join(':');
}

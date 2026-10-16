import { useContext, useEffect, useState } from 'react';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';
import DesktopMonitoringNotice from './DesktopMonitoringNotice';

export default function DesktopTrackingBridge() {
  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const userId = user?._id || user?.id, workspaceId = currentWorkspace?._id;
  const isDesktop=window.flowtaskDesktop?.isDesktop===true;
  const [status,setStatus]=useState(null);
  useEffect(()=>{const tracking=window.flowtaskDesktop?.tracking;if(!isDesktop||!tracking)return;tracking.getStatus().then(setStatus).catch(()=>{});return tracking.onStatus(setStatus);},[isDesktop]);
  useEffect(() => {
    const tracking = window.flowtaskDesktop?.tracking;
    if (!isDesktop||!tracking) return;
    tracking.configure(isAuthenticated && userId && workspaceId && token ? { userId,workspaceId,token } : null).catch(()=>{});
    const refresh = event => {
      if(event.type==='online'){tracking.refresh().then(()=>tracking.retryUploads?.()).catch(()=>{});return;}
      if(event.detail?.type==='tracking:policy-updated'&&event.detail?.payload?.enabled===false)tracking.policyChanged?.(event.detail.payload).catch(()=>{});
      if (event.type !== 'flowtask:realtime' || /^(tracking:|attendance:)/.test(event.detail?.type || '')) tracking.refresh().catch(()=>{});
    };
    window.addEventListener('flowtask:realtime',refresh);window.addEventListener('flowtask:tracking-refresh',refresh);
    window.addEventListener('online',refresh);
    return () => { window.removeEventListener('flowtask:realtime',refresh);window.removeEventListener('flowtask:tracking-refresh',refresh);window.removeEventListener('online',refresh); };
  },[isDesktop,isAuthenticated,userId,workspaceId,token]);
  const scoped=status?.userId===String(userId)&&status?.workspaceId===String(workspaceId)&&isAuthenticated?status:null;
  return isDesktop?<DesktopMonitoringNotice status={scoped}/>:null;
}

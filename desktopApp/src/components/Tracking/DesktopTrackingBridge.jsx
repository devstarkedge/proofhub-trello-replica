import { useContext, useEffect } from 'react';
import AuthContext from '../../context/AuthContext';
import WorkspaceContext from '../../context/WorkspaceContext';

export default function DesktopTrackingBridge() {
  const { user, token, isAuthenticated } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const userId = user?._id || user?.id, workspaceId = currentWorkspace?._id;
  useEffect(() => {
    const tracking = window.flowtaskDesktop?.tracking;
    if (!tracking) return;
    tracking.configure(isAuthenticated && userId && workspaceId && token ? { userId,workspaceId,token } : null).catch(()=>{});
    const refresh = event => {
      if(event.detail?.type==='tracking:policy-updated'&&event.detail?.payload?.enabled===false)tracking.policyChanged?.(event.detail.payload).catch(()=>{});
      if (event.type !== 'flowtask:realtime' || /^(tracking:|attendance:)/.test(event.detail?.type || '')) tracking.refresh().catch(()=>{});
    };
    window.addEventListener('flowtask:realtime',refresh);window.addEventListener('flowtask:tracking-refresh',refresh);
    window.addEventListener('online',refresh);
    return () => { window.removeEventListener('flowtask:realtime',refresh);window.removeEventListener('flowtask:tracking-refresh',refresh);window.removeEventListener('online',refresh); };
  },[isAuthenticated,userId,workspaceId,token]);
  return null;
}

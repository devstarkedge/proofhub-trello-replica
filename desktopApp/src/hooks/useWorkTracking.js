import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import WorkspaceContext from '../context/WorkspaceContext';
import { getTrackingState, errorMessage } from '../services/trackingApi';

export default function useWorkTracking() {
  const { currentWorkspace } = useContext(WorkspaceContext) || {};
  const workspaceId = currentWorkspace?._id;
  const [state, setState] = useState(null), [error, setError] = useState('');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await getTrackingState();
      if (String(next.workspaceId) !== String(workspaceId)) return;
      if (request === generation.current) { setState({ ...next, receivedAt: performance.now() }); setError(''); }
    } catch (e) { if (request === generation.current) setError(errorMessage(e)); }
  }, [workspaceId]);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) reload(); };
    refresh(); const timer = setInterval(refresh, 15000);
    const realtime = event => { if (/^(tracking:|attendance:)|user-role-changed|department-bulk-|permissions.*updated|access.*updated/.test(event.detail?.type || '')) refresh(); };
    window.addEventListener('flowtask:realtime', realtime);
    window.addEventListener('flowtask:tracking-refresh', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('socket-connected', refresh);
    return () => { active = false; clearInterval(timer);
      window.removeEventListener('flowtask:realtime', realtime); window.removeEventListener('flowtask:tracking-refresh', refresh);
      window.removeEventListener('online', refresh); window.removeEventListener('socket-connected', refresh); };
  }, [reload, workspaceId]);
  return { state: String(state?.workspaceId) === String(workspaceId) ? state : null, error, reload };
}

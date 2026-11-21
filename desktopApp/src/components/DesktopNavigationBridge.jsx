import { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceContext from '../context/WorkspaceContext';

// Routing in the existing React tree preserves tracking, socket ownership and
// unsaved session state. PrivateRoute still owns authentication and access.
export default function DesktopNavigationBridge() {
  const navigate = useNavigate();
  const { loading } = useContext(WorkspaceContext);
  useEffect(() => {
    const bridge = window.flowtaskDesktop?.navigation;
    if (!bridge) return;
    const drain = () => {
      if (loading) return;
      return bridge.takePending().then(route => {
        if (route) navigate(route);
      }).catch(() => {});
    };
    const unsubscribe = bridge.onPending(drain);
    drain(); // Also drains links received before React/preload was ready.
    return unsubscribe;
  }, [loading, navigate]);
  return null;
}

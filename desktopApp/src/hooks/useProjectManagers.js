import { useContext, useEffect, useState } from 'react';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import api from '../services/api';

export default function useProjectManagers(departmentId, enabled = true, projectId) {
  const { user } = useContext(AuthContext) || {}, { currentWorkspace } = useContext(WorkspaceContext) || {};
  const [result, setResult] = useState({ key: '', users: [], loading: false, error: '' });
  const key = `${currentWorkspace?._id}:${user?._id || user?.id}:${departmentId}:${projectId || ''}`;
  useEffect(() => {
    if (!enabled || !departmentId || !currentWorkspace?._id) return;
    const controller = new AbortController();
    let request = 0;
    const load = async () => {
      const current = ++request;
      setResult(previous => ({ key, users: previous.key === key ? previous.users : [], loading: true, error: '' }));
      try {
        const response = await api.get(`/api/departments/${departmentId}/project-managers`, { signal: controller.signal, params: { projectId } });
        if (!controller.signal.aborted && current === request) setResult({ key, users: response.data.data, loading: false, error: '' });
      } catch (error) { if (!controller.signal.aborted && current === request) setResult({ key, users: [], loading: false, error: error.response?.data?.message || 'Could not load project managers' }); }
    };
    load();
    const refresh = event => { if (/department|role|membership|permission|access/.test(event.detail?.type || '')) load(); };
    window.addEventListener('flowtask:realtime', refresh);
    return () => { controller.abort(); window.removeEventListener('flowtask:realtime', refresh); };
  }, [key, departmentId, currentWorkspace?._id, enabled, projectId]);
  return result.key === key ? result : { users: [], loading: Boolean(enabled), error: '' };
}

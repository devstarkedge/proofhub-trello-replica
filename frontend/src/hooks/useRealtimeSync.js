import { useContext, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AuthContext from '../context/AuthContext';
import WorkspaceContext from '../context/WorkspaceContext';
import useProjectStore from '../store/projectStore';
import useWorkflowStore from '../store/workflowStore';

// Socket events invalidate authorized reads; they are never permission grants.
export default function useRealtimeSync() {
  const { user } = useContext(AuthContext);
  const { currentWorkspace } = useContext(WorkspaceContext);
  const client = useQueryClient();
  useEffect(() => {
    if (!user || !currentWorkspace?._id) return;
    let timer, disposed = false, workflowDirty = false, projectsDirty = false;
    const changed = event => {
      const { type } = event.detail || {};
      const payload = event.detail?.payload || {};
      if (payload.workspaceId && String(payload.workspaceId) !== String(currentWorkspace._id)) return;
      const eventType = type === 'notification' ? payload.type : type;
      if (!/card|list|comment|subtask|attachment|task|board|project|department|assigned|access|authz|recovery|data-changed/.test(eventType || '')) return;
      const workflow = useWorkflowStore.getState();
      const boardId = payload.boardId || payload.board?._id || payload.board;
      if (type === 'access-changed' && String(boardId) === String(workflow.currentProjectId)) workflow.reset();
      if (/card|list|comment|subtask|attachment|task|board|data-changed/.test(eventType || '')) {
        if (type === 'card-updated' && workflow.cardsById[payload.cardId] && payload.updates) workflow.updateCardLocal(payload.cardId, payload.updates);
        else if (type === 'card-deleted' && payload.cardId) workflow.removeCardFromSocket(payload.cardId);
        if (!boardId || String(boardId) === String(workflow.currentProjectId)) workflowDirty = true;
      }
      if (/board|project|department|assigned|access|authz|data-changed/.test(eventType || '')) projectsDirty = true;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (disposed) return;
        client.invalidateQueries({ predicate: query => ['projects', 'project', 'cards', 'card', 'tasks', 'dashboard', 'workflow'].includes(query.queryKey[0]) });
        window.dispatchEvent(new CustomEvent('flowtask:data-invalidated', { detail: { workspaceId: currentWorkspace._id } }));
        if (projectsDirty) { projectsDirty = false; useProjectStore.getState().fetchDepartments(true); }
        const state = useWorkflowStore.getState();
        if (workflowDirty && state.currentProjectId) { workflowDirty = false; state.initializeWorkflow(state.currentProjectId); }
      }, 150);
    };
    const recover = () => { workflowDirty = true; projectsDirty = true; changed({ detail: { type: 'recovery' } }); };
    window.addEventListener('flowtask:realtime', changed);
    for (const name of ['socket-connected', 'online', 'desktop-resume']) window.addEventListener(name, recover);
    return () => {
      disposed = true; clearTimeout(timer);
      window.removeEventListener('flowtask:realtime', changed);
      for (const name of ['socket-connected', 'online', 'desktop-resume']) window.removeEventListener(name, recover);
    };
  }, [user?._id, currentWorkspace?._id, client]);
}

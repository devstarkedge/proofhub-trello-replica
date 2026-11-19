import { toast } from 'react-toastify';
import { createProjectSaveActions } from '../../../shared/projectSaveActions.mjs';
import Database from '../services/database';
import useProjectStore from '../store/projectStore';
import useDepartmentStore from '../store/departmentStore';
import useWorkflowStore from '../store/workflowStore';
import { registerResettable } from '../store/resetRegistry';

export const projectSaveActions = createProjectSaveActions({
  storage:localStorage, toast,
  update:(projectId, updates) => Database.updateProject(projectId, updates),
  confirmed:project => {
    useProjectStore.getState().projectUpdated(project);
    useDepartmentStore.getState().projectMoved(project);
    const workflow = useWorkflowStore.getState();
    workflow.invalidateProjectCache(project._id);
    if (String(workflow.board?._id) === String(project._id)) workflow.updateBoard(project);
  }
});
registerResettable(() => projectSaveActions.invalidate());

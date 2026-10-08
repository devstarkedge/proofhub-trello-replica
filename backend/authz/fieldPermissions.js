import { can } from './engine.js';
import { strictUpdate } from '../utils/strictUpdate.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
export const TASK_FIELDS = Object.freeze({ title: 'task.update', description: 'task.update', status: 'task.update', labels: 'task.update', coverImage: 'attachment.manage', list: 'task.move', position: 'task.move', startDate: 'task.edit_dates', dueDate: 'task.edit_dates', priority: 'task.edit_priority', assignees: 'task.assign', members: 'task.assign', isArchived: 'task.archive', estimationTime: 'time.log', loggedTime: 'time.log', billedTime: 'time.log' });
export const PROJECT_FIELDS = Object.freeze({ name: 'project.update', description: 'project.update', startDate: 'project.update', dueDate: 'project.update', status: 'project.update', priority: 'project.update', clientDetails: 'project.update', members: 'project.manage_members', managers: 'project.manage_members', owner: 'project.manage_members', visibility: 'project.change_visibility', department: 'project.update' });
export function permittedUpdate(ctx, resource, input, fields) {
  const patch = strictUpdate(input, Object.keys(fields));
  for (const [field, permission] of Object.entries(fields)) if (patch[field] !== undefined && !can(ctx, permission, resource)) throw new ErrorResponse(`Permission denied: ${permission}`, 403);
  return patch;
}

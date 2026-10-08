import { ErrorResponse } from '../middleware/errorHandler.js';

// Reject unsafe fields before any controller mutates data or queues side effects.
export function strictUpdate(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ErrorResponse('An object body is required', 400);
  }
  const unknown = Object.keys(body).filter(key => !allowed.includes(key));
  if (unknown.length) throw new ErrorResponse(`Unsupported update fields: ${unknown.join(', ')}`, 400);
  return { ...body };
}

export const TASK_UPDATE_FIELDS = ['title', 'description', 'descriptionMentions', 'list', 'status', 'position', 'assignees', 'members', 'labels', 'priority', 'dueDate', 'startDate', 'coverImage', 'isCover', 'attachments', 'estimationTime', 'loggedTime', 'billedTime'];
export const SUBTASK_UPDATE_FIELDS = ['title', 'description', 'status', 'priority', 'assignees', 'watchers', 'tags', 'dueDate', 'startDate', 'attachments', 'colorToken', 'coverImage', 'order', 'estimationTime', 'loggedTime', 'billedTime', 'completed'];
export const NANO_UPDATE_FIELDS = SUBTASK_UPDATE_FIELDS.filter(f => !['watchers', 'completed'].includes(f));
export const LIST_UPDATE_FIELDS = ['title', 'position', 'color', 'isArchived'];

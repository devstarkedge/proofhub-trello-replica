import Card from '../models/Card.js';
import { resourceReadFilter } from './resourceReadFilter.js';
import { assignedWorkOnly } from '../../shared/assignedWorkAccess.mjs';

// Persisted notifications can outlive an assignment. Filter before pagination,
// population and counts, using the same current task scope as direct reads.
export async function assignedWorkNotificationFilter(req) {
  if (!assignedWorkOnly(req.user)) return {};
  if (req.assignedNotificationFilter) return req.assignedNotificationFilter;
  const taskIds = await Card.distinct('_id', await resourceReadFilter(req, 'task'));
  const projectIds = (req.readProjects.get('all:false') || []).map(project => project._id);
  const optionalRef = (field, values) => ({ $or: [{ [field]: null }, { [field]: { $in: values } }] });
  const roots = [...taskIds, ...taskIds.map(String)];
  req.assignedNotificationFilter = { $and: [
    optionalRef('taskId', taskIds), optionalRef('relatedCard', taskIds), optionalRef('metadata.taskId', roots),
    optionalRef('projectId', projectIds), optionalRef('relatedBoard', projectIds),
    { $or: [
      { taskId: { $in: taskIds } }, { relatedCard: { $in: taskIds } }, { 'metadata.taskId': { $in: roots } },
      { entityType: 'Card', entityId: { $in: taskIds } },
      { entityType: { $nin: ['Card', 'Comment', 'Subtask', 'SubtaskNano'] }, type: { $not: /^(task_|card_|subtask_|comment_|attachment_)/ } }
    ] },
    { $or: [{ entityType: { $ne: 'Board' } }, { entityId: { $in: projectIds } }] }
  ] };
  return req.assignedNotificationFilter;
}

import mongoose from 'mongoose';
import Card from '../../models/Card.js';
import { WorkSession } from './tracking.models.js';
import { contextFor, policyFor, fail, objectId } from './tracking.service.js';
import { readVisibilityScope } from './tracking.visibility.js';
import { dashboardReadPipeline } from './tracking.dashboardRead.js';
import { can } from './tracking.authorization.js';
import { cachedTrackingRead, trackingAccessFingerprint } from './tracking.readCache.js';
const id = value => String(value?._id || value || '');

// Reporting choices are independent of the work-selection endpoint, which
// intentionally returns only the logged-in person's currently assigned tasks.
export async function trackingFilterOptions(workspaceId, viewerId, query = {}) {
  for (const field of ['userId', 'projectId', 'cursor', 'taskCursor']) if (query[field]) objectId(query[field]);
  const ctx = await contextFor(workspaceId, viewerId, { readOnly: true });
  const scope = await readVisibilityScope(ctx);
  const owner = query.userId;
  if (owner && !scope.canOwner(owner)) fail('User not found', 404);
  if (!owner && !scope.members.some(member => scope.canOwner(member.user))) fail('Report access required', 403);
  const policy = await policyFor(workspaceId);
  return cachedTrackingRead({ workspaceId, viewerId, kind: 'filter-options', query,
    access: trackingAccessFingerprint(ctx, scope), ttlMs: 15000 }, async () => {
    let associated = null, historicalTasks = [];
    if (owner) {
      const now = new Date();
      const pipeline = dashboardReadPipeline({ workspaceId, ctx, scope, owners: [owner],
        bounds: { workspaceId: new mongoose.Types.ObjectId(workspaceId) }, query: {},
        dates: { start: new Date(0), end: now }, now, policy });
      pipeline.push({ $unwind: '$_selected' }, { $project: { project: '$_selected.project', attributedProject: '$_selected.attributedProject',
        task: '$_selected.task', attributedTask: '$_selected.attributedTask', linkedTask: '$_selected.linkedTask' } },
        { $group: { _id: null, projects: { $addToSet: '$project' }, attributedProjects: { $addToSet: '$attributedProject' },
          tasks: { $addToSet: '$task' }, attributedTasks: { $addToSet: '$attributedTask' }, linkedTasks: { $addToSet: '$linkedTask' } } });
      const [history, assigned] = await Promise.all([
        WorkSession.aggregate(pipeline).option({ maxTimeMS: 8000 }),
        Card.distinct('board', { workspaceId, assignees: owner, isArchived: { $ne: true } })
      ]);
      const row = history[0] || {};
      associated = new Set([...assigned, ...(row.projects || []), ...(row.attributedProjects || [])].filter(Boolean).map(id));
      historicalTasks = [...(row.tasks || []), ...(row.attributedTasks || []), ...(row.linkedTasks || [])].filter(Boolean);
    }
    const projects = [...scope.projectMap.values()].filter(project => !project.isDeleted && can(ctx, 'project.view', project) &&
      (!associated || associated.has(id(project)))).sort((a, b) => id(a).localeCompare(id(b)));
    const project = query.projectId ? projects.find(row => id(row) === query.projectId) : null;
    if (query.projectId && !project) fail('Project not found', 404);
    const batch = projects.filter(row => !query.cursor || id(row) > query.cursor).slice(0, 51);
    const result = { projects: batch.slice(0, 50).map(row => ({ _id: row._id, name: row.name })), tasks: [],
      nextProjectCursor: batch.length > 50 ? id(batch[49]) : null, nextTaskCursor: null };
    if (project) {
      const tasks = await Card.find({ workspaceId, board: project._id,
        ...(owner ? { $or: [{ assignees: owner }, { _id: { $in: historicalTasks } }] } : {}),
        ...(query.taskCursor ? { _id: { $gt: query.taskCursor } } : {}) })
        .select('_id workspaceId board title assignees members createdBy').sort({ _id: 1 }).limit(51).lean();
      result.tasks = tasks.slice(0, 50).filter(task => can(ctx, 'task.view', { ...task, project, taskResource: task })).map(task => ({ _id: task._id, title: task.title }));
      result.nextTaskCursor = tasks.length > 50 ? id(tasks[49]) : null;
    }
    return result;
  });
}

import mongoose from 'mongoose';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import { buildContext } from '../authz/context.js';
import { loadAssignments } from '../authz/loaders.js';
import { projectAccessFilter, scopeFilter } from '../authz/engine.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

const idFields = new Set(['_id', 'workspaceId', 'board', 'card', 'task', 'subtask', 'nanoSubtask', 'comment', 'contextRef', 'user', 'createdBy', 'uploadedBy', 'owner', 'members', 'assignees', 'department']);
function cast(value, field) {
  if (Array.isArray(value)) return value.map(item => cast(item, field));
  if (value && typeof value === 'object' && !value._bsontype) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cast(child, key.startsWith('$') ? field : key)]));
  return idFields.has(field) && typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new mongoose.Types.ObjectId(value) : value;
}
async function boundedIds(query) {
  const rows = await query.select('_id').limit(100001).lean();
  if (rows.length > 100000) throw new ErrorResponse('Choose a narrower project or task for this view', 413);
  return rows.map(row => row._id);
}

/** Lists/search/counts must enforce the same grant and deny scope as a direct
 * read. Return a Mongo predicate, including ObjectIds for aggregation callers. */
export async function resourceReadFilter(req, type = 'task', projectId) {
  if (process.env.AUTHZ_V2 !== 'enforce') return {};
  req.readFilters ||= new Map();
  const cacheKey = `${type}:${projectId || 'all'}`;
  if (req.readFilters.has(cacheKey)) return req.readFilters.get(cacheKey);
  req.projectAuthz ||= await buildContext(req.user._id || req.user.id, req.workspaceId);
  const ctx = req.projectAuthz;
  const assigned = ctx.restriction?.type === 'assigned_only' || [...Object.values(ctx.grants || {}), ...Object.values(ctx.denies || {})].flat().some(record => record.scope === 'assigned');
  if (assigned) await loadAssignments(ctx);
  req.readProjects ||= new Map();
  const projectKey = String(projectId || 'all');
  if (!req.readProjects.has(projectKey)) req.readProjects.set(projectKey, await Board.find({ $and: [projectAccessFilter(ctx), projectId ? { _id: projectId } : {}] }).select('workspaceId owner members managers department visibility isDeleted guests').lean());
  const projects = req.readProjects.get(projectKey);
  const local = { ...ctx };
  if (type === 'attachment' && assigned) {
    const parent = { task: { $in: ctx.assignedTaskIds || [] }, board: { $in: projects.map(project => project._id) } };
    [local.assignedSubtaskIds, local.assignedNanoIds, local.assignedCommentIds] = await Promise.all([boundedIds(Subtask.find(parent)), boundedIds(SubtaskNano.find(parent)), boundedIds(Comment.find({ card: { $in: ctx.assignedTaskIds || [] } }))]);
  }
  let filter = scopeFilter(local, 'task.view', type, projects);
  if (type === 'comment') {
    const cache = new Map();
    const rewrite = async value => {
      if (Array.isArray(value)) return Promise.all(value.map(rewrite));
      if (!value || typeof value !== 'object' || value._bsontype) return value;
      const output = {};
      for (const [key, child] of Object.entries(value)) {
        if (key !== 'board') { output[key] = await rewrite(child); continue; }
        const serialized = JSON.stringify(child);
        if (!cache.has(serialized)) cache.set(serialized, await boundedIds(Card.find({ board: child })));
        output.card = { $in: cache.get(serialized) };
      }
      return output;
    };
    filter = await rewrite(filter);
  }
  const result = cast(filter); req.readFilters.set(cacheKey, result); return result;
}

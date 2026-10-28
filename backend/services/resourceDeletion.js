import mongoose from 'mongoose';
import Board from '../models/Board.js';
import List from '../models/List.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
import Activity from '../models/Activity.js';
import VersionHistory from '../models/VersionHistory.js';
import RecurringTask from '../models/RecurringTask.js';
import Label from '../models/Label.js';
import Reminder from '../models/Reminder.js';
import Department from '../models/Department.js';
import Milestone from '../models/Milestone.js';
import MilestoneApproval from '../models/MilestoneApproval.js';
import MilestoneRevenueRecognition from '../models/MilestoneRevenueRecognition.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import FileDeletionJob from '../models/FileDeletionJob.js';
import RecurrenceOccurrence from '../models/RecurrenceOccurrence.js';
import { run, getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';
import { authorizeProjectResource } from './projectAuthorization.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

const models = { board: Board, list: List, card: Card, subtask: Subtask, nano: SubtaskNano };
const related = (cards, subtasks, nanos, extra = []) => [
  { card: { $in: cards } }, { subtask: { $in: subtasks } }, { subtaskNano: { $in: nanos } },
  { nanoSubtask: { $in: nanos } }, { contextRef: { $in: [...cards, ...subtasks, ...nanos, ...extra] } }
];

/** Shared cascade for HTTP, domain services and retention workers. Network
 * deletion is represented by a durable job in the same database transaction. */
export async function deleteResource(kind, resourceId, { actor, requireExpiredAt, requireDeletedBefore, session: providedSession } = {}) {
  const Model = models[kind];
  if (!Model || !mongoose.isValidObjectId(resourceId)) throw new ErrorResponse('Resource not found', 404);
  const root = await Model.findById(resourceId).lean();
  if (!root) return { deleted: false };
  if (getActiveWorkspaceId() && String(root.workspaceId) !== String(getActiveWorkspaceId())) throw new ErrorResponse('Resource not found', 404);
  return run({ workspaceId: root.workspaceId }, async () => {
    if (actor) await authorizeProjectResource({ user: actor, workspaceId: root.workspaceId }, { card: 'task', board: 'project' }[kind] || kind, resourceId, kind === 'board' ? 'project.delete' : 'task.delete');
    const session = providedSession || await mongoose.startSession();
    let result = { deleted: false };
    const execute = async () => {
        const current = await Model.findById(resourceId).session(session).lean();
        if (!current) return;
        if (requireExpiredAt && (!current.isArchived || !current.autoDeleteAt || current.autoDeleteAt > requireExpiredAt)) return;
        if (requireDeletedBefore && (!current.isDeleted || !current.deletedAt || current.deletedAt > requireDeletedBefore)) return;
        const boardId = kind === 'board' ? current._id : current.board;
        if (kind === 'board' && (await MilestoneApproval.exists({ board: boardId }).session(session) || await MilestoneRevenueRecognition.exists({ board: boardId }).session(session))) throw new ErrorResponse('Projects with approved revenue must be archived, not permanently deleted', 409);
        const cards = kind === 'card' ? [current._id] : ['board', 'list'].includes(kind) ? await Card.distinct('_id', { [kind === 'board' ? 'board' : 'list']: current._id }).session(session) : [];
        const subtasks = kind === 'subtask' ? [current._id] : kind === 'nano' ? [] : await Subtask.distinct('_id', kind === 'board' ? { $or: [{ board: boardId }, { task: { $in: cards } }] } : { task: { $in: cards } }).session(session);
        const nanos = kind === 'nano' ? [current._id] : await SubtaskNano.distinct('_id', { $or: [{ task: { $in: cards } }, { subtask: { $in: subtasks } }, ...(kind === 'board' ? [{ board: boardId }] : [])] }).session(session);
        const commentMatch = { $or: related(cards, subtasks, nanos) };
        const comments = await Comment.distinct('_id', commentMatch).session(session);
        const attachmentMatch = { $or: [...related(cards, subtasks, nanos, comments), { comment: { $in: comments } }, ...(kind === 'board' ? [{ board: boardId }] : [])] };
        const attachments = await Attachment.find(attachmentMatch).session(session).select('publicId resourceType deliveryType').lean();
        const assetSources = [...attachments];
        for (const doc of [current, ...await Card.find({ _id: { $in: cards } }).session(session).select('attachments').lean(), ...await Subtask.find({ _id: { $in: subtasks } }).session(session).select('attachments').lean(), ...await SubtaskNano.find({ _id: { $in: nanos } }).session(session).select('attachments').lean()]) {
          assetSources.push(...(doc.attachments || []));
          if (kind === 'board' && doc.coverImage?.publicId) assetSources.push(doc.coverImage, ...(doc.coverImageHistory || []));
        }
        for (const asset of assetSources) {
          const publicId = asset.publicId || asset.public_id;
          if (!publicId) continue;
          const key = { publicId, resourceType: asset.resourceType || asset.resource_type || 'image', deliveryType: asset.deliveryType || 'upload' };
          await FileDeletionJob.findOneAndUpdate(key, { $set: { state: 'pending', nextAttemptAt: new Date() }, $setOnInsert: { workspaceId: root.workspaceId }, $unset: { expiresAt: 1 } }, { upsert: true, session, setDefaultsOnInsert: true });
        }
        await Attachment.deleteMany(attachmentMatch, { session });
        await Comment.deleteMany(commentMatch, { session });
        await VersionHistory.deleteMany({ $or: [{ entityId: { $in: [...cards, ...subtasks, ...nanos, ...comments] } }, { card: { $in: cards } }, ...(kind === 'board' ? [{ board: boardId }] : [])] }, { session });
        await Activity.deleteMany({ $or: [...related(cards, subtasks, nanos), ...(kind === 'board' ? [{ board: boardId }] : [])] }, { session });
        await RecurringTask.deleteMany({ card: { $in: cards } }, { session });
        await RecurrenceOccurrence.deleteMany({ card: { $in: cards } }, { session });
        await RecurringTask.updateMany({ generatedSubtasks: { $in: subtasks } }, { $pull: { generatedSubtasks: { $in: subtasks } } }, { session });
        await SubtaskNano.deleteMany({ _id: { $in: nanos } }, { session });
        await Subtask.deleteMany({ _id: { $in: subtasks } }, { session });
        await Card.deleteMany({ _id: { $in: cards } }, { session });
        if (kind === 'board') {
          await Reminder.deleteMany({ project: boardId }, { session });
          await Label.deleteMany({ board: boardId }, { session });
          await Milestone.deleteMany({ board: boardId }, { session });
          await List.deleteMany({ board: boardId }, { session });
          await Department.updateMany({ projects: boardId }, { $pull: { projects: boardId } }, { session });
          await WorkspaceMembership.updateMany({ workspace: root.workspaceId, $or: [{ allowedProjects: boardId }, { 'restriction.projectIds': boardId }] }, { $pull: { allowedProjects: boardId, 'restriction.projectIds': boardId }, $inc: { permVersion: 1 } }, { session });
        }
        // Delete the root through the model so assignment-history hooks still run.
        if (['board', 'list'].includes(kind)) await Model.deleteOne({ _id: current._id }, { session });
        result = { deleted: true, root: current, boardId, cardIds: cards };
    };
    try {
      if (providedSession) await execute(); else await session.withTransaction(execute);
    } finally { if (!providedSession) await session.endSession(); }
    if (result.deleted && !providedSession && process.env.NODE_ENV !== 'test') {
      import('./fileDeletionJobs.js').then(module => module.processFileDeletionJobs()).catch(() => {});
    }
    return result;
  });
}

import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Board from '../models/Board.js';
import List from '../models/List.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Label from '../models/Label.js';
import Activity from '../models/Activity.js';
import { copyTaskFiles } from './taskFileCopy.js';
import { deleteResource } from './resourceDeletion.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

/** Copy/promotion commits the complete hierarchy and file references before
 * acknowledging success. Retried transaction callbacks perform no delivery. */
export async function copyTaskHierarchy(kind, sourceId, { boardId, listId, actor, options = {}, promote = false }) {
  const session = await mongoose.startSession(); let result;
  const { copyComments = true, copyAttachments = true, copyChecklist = true, copyAssignees = true, copyDueDates = true } = options;
  const Model = kind === 'card' ? Card : Subtask;
  try {
    await session.withTransaction(async () => {
      const source = await Model.findById(sourceId).session(session).lean();
      const list = await List.findOne({ _id: listId, board: boardId }).session(session).lean();
      const project = await Board.findById(boardId).select('name').session(session).lean();
      if (!source || !list || !project) throw new ErrorResponse('Source or destination no longer exists', 404);
      await List.updateOne({ _id: listId }, { $inc: { __v: 1 } }, { session });
      const labelsFor = async ids => {
        if (String(source.board) === String(boardId)) return ids || [];
        const labels = await Label.find({ _id: { $in: ids || [] }, board: source.board }).session(session).lean();
        const idsOut = [];
        for (const label of labels) idsOut.push((await Label.findOneAndUpdate({ board: boardId, name: label.name, color: label.color }, { $setOnInsert: { name: label.name, color: label.color, board: boardId, createdBy: label.createdBy } }, { session, upsert: true, new: true }))._id);
        return idsOut;
      };
      const common = item => ({ title: item.title, description: item.description || '', priority: item.priority, assignees: copyAssignees ? item.assignees || [] : [], dueDate: copyDueDates ? item.dueDate : null, startDate: copyDueDates ? item.startDate : null, attachments: copyAttachments ? item.attachments || [] : [], estimationTime: [], loggedTime: [], billedTime: [], createdBy: actor.id || actor._id, board: boardId });
      const tail = await Card.findOne({ list: listId, isArchived: false }).sort({ position: -1 }).session(session).lean();
      const [card] = await Card.create([{ ...common(source), descriptionMentions: source.descriptionMentions || [], list: listId, position: (tail?.position ?? -1) + 1, status: list.title.toLowerCase().replace(/\s+/g, '-'), members: copyAssignees ? source.members || [] : [], labels: await labelsFor(source.labels || source.tags), createdFrom: 'board', isArchived: false }], { session });
      await copyTaskFiles(kind, source._id, 'card', card, { files: copyAttachments, comments: copyComments, session });
      const children = copyChecklist ? await (kind === 'card' ? Subtask.find({ task: source._id }) : SubtaskNano.find({ subtask: source._id })).session(session).lean() : [];
      let complete = 0, nanoTotal = 0, nanoComplete = 0;
      for (const child of children) {
        const [subtask] = await Subtask.create([{ ...common(child), task: card._id, order: child.order, status: child.status, tags: await labelsFor(child.tags), colorToken: child.colorToken, breadcrumbs: { project: project.name, task: card.title } }], { session });
        await copyTaskFiles(kind === 'card' ? 'subtask' : 'nano', child._id, 'subtask', subtask, { files: copyAttachments, comments: copyComments, session });
        if (['done', 'closed'].includes(child.status)) complete++;
        if (kind !== 'card') continue;
        const nanos = await SubtaskNano.find({ subtask: child._id }).session(session).lean();
        for (const original of nanos) {
          const [nano] = await SubtaskNano.create([{ ...common(original), task: card._id, subtask: subtask._id, order: original.order, status: original.status, tags: await labelsFor(original.tags), colorToken: original.colorToken, breadcrumbs: { project: project.name, task: card.title, subtask: subtask.title } }], { session });
          await copyTaskFiles('nano', original._id, 'nano', nano, { files: copyAttachments, comments: copyComments, session });
          nanoTotal++; if (['done', 'closed'].includes(original.status)) nanoComplete++;
        }
      }
      card.subtaskStats = { total: children.length, completed: complete, nanoTotal, nanoCompleted: nanoComplete }; await card.save({ session });
      if (promote) {
        const deleted = await deleteResource(kind, source._id, { session });
        if (!deleted.deleted) throw new ErrorResponse('Source changed during promotion', 409);
      }
      await Activity.create([{ type: promote ? 'subtask_promoted' : 'card_copied', description: `${promote ? 'Promoted' : 'Copied'} "${source.title}"`, user: actor.id || actor._id, board: boardId, card: card._id, list: listId, contextType: 'task', metadata: { sourceId: source._id, sourceBoardId: source.board } }], { session });
      result = { card, source };
    });
  } finally { await session.endSession(); }
  return result;
}

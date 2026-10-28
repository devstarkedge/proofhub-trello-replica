import mongoose from 'mongoose';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Attachment from '../models/Attachment.js';
import RecurringTask from '../models/RecurringTask.js';
import Label from '../models/Label.js';
import { authorizeProjectResource } from './projectAuthorization.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

export async function authorizeDestination(req, boardId, listId) {
  const project = await authorizeProjectResource(req, 'project', boardId, 'task.create');
  const list = await authorizeProjectResource(req, 'list', listId, 'task.create');
  if (String(list.board) !== String(project._id)) throw new ErrorResponse('Destination list must belong to the destination project', 400);
  return { project, list };
}

export async function moveTaskHierarchy(cardId, { boardId, listId, position, status, expectedRevision }) {
  const session = await mongoose.startSession(); let moved;
  const labelsFor = async (ids, sourceBoard) => {
    if (String(sourceBoard) === String(boardId)) return ids || [];
    const labels = await Label.find({ _id: { $in: ids || [] }, board: sourceBoard }).session(session).lean();
    const mapped = [];
    for (const label of labels) {
      const target = await Label.findOneAndUpdate({ board: boardId, name: label.name, color: label.color }, { $setOnInsert: { board: boardId, name: label.name, color: label.color, createdBy: label.createdBy } }, { upsert: true, new: true, session });
      mapped.push(target._id);
    }
    return mapped;
  };
  try {
    await session.withTransaction(async () => {
      const card = await Card.findById(cardId).session(session);
      if (!card) throw new ErrorResponse('Task no longer exists', 404);
      if (expectedRevision !== undefined && card.__v !== expectedRevision) throw new ErrorResponse('Task changed since this move; refresh before moving it again', 409);
      const sourceBoard = card.board, sourceList = card.list;
      await Card.updateMany({ _id: { $ne: card._id }, list: sourceList, position: { $gt: card.position }, isArchived: false }, { $inc: { position: -1 } }, { session });
      const tail = position == null ? await Card.findOne({ _id: { $ne: card._id }, list: listId, isArchived: false }).sort({ position: -1 }).session(session).lean() : null;
      const targetPosition = position ?? (tail?.position ?? -1) + 1;
      if (!Number.isInteger(targetPosition) || targetPosition < 0) throw new ErrorResponse('Invalid task position', 400);
      await Card.updateMany({ _id: { $ne: card._id }, list: listId, position: { $gte: targetPosition }, isArchived: false }, { $inc: { position: 1 } }, { session });
      card.board = boardId; card.list = listId; card.position = targetPosition; card.status = status;
      card.labels = await labelsFor(card.labels, sourceBoard);
      await card.save({ session });
      if (String(sourceBoard) !== String(boardId)) {
        const subtasks = await Subtask.find({ task: card._id }).session(session);
        for (const child of subtasks) { child.tags = await labelsFor(child.tags, child.board); child.board = boardId; await child.save({ session }); }
        const nanos = await SubtaskNano.find({ $or: [{ task: card._id }, { subtask: { $in: subtasks.map(child => child._id) } }] }).session(session);
        for (const child of nanos) { child.tags = await labelsFor(child.tags, child.board); child.board = boardId; await child.save({ session }); }
        await Attachment.updateMany({ $or: [{ card: card._id }, { subtask: { $in: subtasks.map(child => child._id) } }, { nanoSubtask: { $in: nanos.map(child => child._id) } }] }, { $set: { board: boardId } }, { session });
        const schedules = await RecurringTask.find({ card: card._id }).session(session);
        for (const schedule of schedules) { schedule.subtaskTemplate.tags = await labelsFor(schedule.subtaskTemplate.tags, schedule.board); schedule.board = boardId; await schedule.save({ session }); }
      }
      moved = card;
    });
  } finally { await session.endSession(); }
  return moved;
}

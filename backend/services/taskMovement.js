import List from '../models/List.js';
import CardMovement from '../models/CardMovement.js';
import { withTrackingTransaction } from '../modules/tracking/tracking.writes.js';
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

export async function moveTaskHierarchy(cardId, { boardId, listId, position, status, expectedRevision, expectedBoardId, expectedMovementRevision, movement }) {
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
    await withTrackingTransaction(session, async () => {
      const card = await Card.findById(cardId).session(session);
      if (!card) throw new ErrorResponse('Task no longer exists', 404);
      if (expectedBoardId !== undefined && String(card.board) !== String(expectedBoardId)) throw new ErrorResponse('Task changed projects; refresh before moving it again', 409);
      if (expectedRevision !== undefined && card.__v !== expectedRevision) throw new ErrorResponse('Task changed since this move; refresh before moving it again', 409);
      if (movement) {
        const receipt = await CardMovement.findOne({_id:movement._id,status:'PROCESSING',leaseOwner:movement.leaseOwner}).session(session).lean();
        if (!receipt) throw new ErrorResponse('Movement processing lease changed',503);
      }
      if (expectedMovementRevision !== undefined && (card.movementRevision || 0) !== expectedMovementRevision) throw new ErrorResponse('This card was moved by another user. Refresh and retry your move.',409);
      const sourceBoard = card.board, sourceList = card.list;
      const oldStatus = card.status;
      const sourceListRecord = movement ? await List.findById(card.list).select('title').session(session).lean() : null;
      await Card.updateMany({ _id: { $ne: card._id }, list: sourceList, position: { $gt: card.position }, isArchived: false }, { $inc: { position: -1 } }, { session });
      const tail = position == null ? await Card.findOne({ _id: { $ne: card._id }, list: listId, isArchived: false }).sort({ position: -1 }).session(session).lean() : null;
      const targetPosition = position == null ? (tail?.position ?? -1) + 1 : Math.min(position, await Card.countDocuments({ _id: { $ne: card._id }, list: listId, isArchived: false }).session(session));
      if (!Number.isInteger(targetPosition) || targetPosition < 0) throw new ErrorResponse('Invalid task position', 400);
      await Card.updateMany({ _id: { $ne: card._id }, list: listId, position: { $gte: targetPosition }, isArchived: false }, { $inc: { position: 1 } }, { session });
      card.board = boardId; card.list = listId; card.position = targetPosition; card.status = status;
      card.labels = await labelsFor(card.labels, sourceBoard);
      card.movementRevision = (card.movementRevision || 0) + 1;
      await card.save({ session });
      if (movement) {
        const saved = await CardMovement.updateOne({_id:movement._id,status:'PROCESSING',leaseOwner:movement.leaseOwner},{$set:{status:'APPLIED',result:{_id:card._id,list:card.list,position:card.position,status:card.status,__v:card.__v,movementRevision:card.movementRevision},effect:{card:{title:card.title,assignees:card.assignees,members:card.members},oldStatus,sourceListId:sourceList,fromList:sourceListRecord?.title||'',toList:movement.toList,actor:movement.actor},completedAt:new Date(),expiresAt:new Date(Date.now()+7*86400000)}},{session});
        if (!saved.matchedCount) throw new ErrorResponse('Movement processing lease changed',503);
      }
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

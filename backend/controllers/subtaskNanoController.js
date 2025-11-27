import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import { emitToBoard } from '../server.js';
import { refreshCardHierarchyStats, refreshSubtaskNanoStats } from '../utils/hierarchyStats.js';
import { invalidateHierarchyCache } from '../utils/cacheInvalidation.js';

const populateConfig = [
  { path: 'assignees', select: 'name email avatar' }
];

const getOrderedNanos = (subtaskId) => {
  return SubtaskNano.find({ subtask: subtaskId })
    .sort({ order: 1, createdAt: 1 })
    .populate(populateConfig);
};

export const getNanosForSubtask = asyncHandler(async (req, res, next) => {
  const { subtaskId } = req.params;
  const subtask = await Subtask.findById(subtaskId);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const nanos = await getOrderedNanos(subtaskId);
  res.status(200).json({
    success: true,
    data: nanos
  });
});

export const getNanoById = asyncHandler(async (req, res, next) => {
  const nano = await SubtaskNano.findById(req.params.id)
    .populate(populateConfig);

  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  res.status(200).json({
    success: true,
    data: nano
  });
});

export const createNano = asyncHandler(async (req, res, next) => {
  const { subtaskId } = req.params;
  const subtask = await Subtask.findById(subtaskId).populate('task board');
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const card = await Card.findById(subtask.task).populate('board', 'name');

  const count = await SubtaskNano.countDocuments({ subtask: subtaskId });
  const nano = await SubtaskNano.create({
    subtask: subtaskId,
    task: subtask.task,
    board: subtask.board,
    title: req.body.title,
    description: req.body.description,
    status: req.body.status || 'todo',
    priority: req.body.priority || 'medium',
    assignees: req.body.assignees || [],
    dueDate: req.body.dueDate,
    startDate: req.body.startDate,
    tags: req.body.tags || [],
    attachments: req.body.attachments || [],
    colorToken: req.body.colorToken || 'pink',
    estimationTime: req.body.estimationTime || [],
    loggedTime: req.body.loggedTime || [],
    billedTime: req.body.billedTime || [],
    order: req.body.order ?? count,
    createdBy: req.user.id,
    breadcrumbs: {
      project: card?.board?.name || '',
      task: card?.title || '',
      subtask: subtask.title
    }
  });

  const populated = await SubtaskNano.findById(nano._id).populate(populateConfig);

  await refreshSubtaskNanoStats(subtaskId);
  await refreshCardHierarchyStats(subtask.task);

  emitToBoard(subtask.board.toString(), 'hierarchy-nano-changed', {
    type: 'created',
    subtaskId,
    nano: populated
  });
  invalidateHierarchyCache({
    boardId: subtask.board,
    listId: card?.list,
    cardId: subtask.task,
    subtaskId,
    subtaskNanoId: nano._id
  });

  res.status(201).json({
    success: true,
    data: populated
  });
});

export const updateNano = asyncHandler(async (req, res, next) => {
  let nano = await SubtaskNano.findById(req.params.id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const updates = {
    title: req.body.title ?? nano.title,
    description: req.body.description ?? nano.description,
    status: req.body.status ?? nano.status,
    priority: req.body.priority ?? nano.priority,
    assignees: req.body.assignees ?? nano.assignees,
    dueDate: req.body.dueDate ?? nano.dueDate,
    startDate: req.body.startDate ?? nano.startDate,
    tags: req.body.tags ?? nano.tags,
    attachments: req.body.attachments ?? nano.attachments,
    colorToken: req.body.colorToken ?? nano.colorToken,
    estimationTime: req.body.estimationTime ?? nano.estimationTime,
    loggedTime: req.body.loggedTime ?? nano.loggedTime,
    billedTime: req.body.billedTime ?? nano.billedTime,
    updatedBy: req.user.id
  };

  if (req.body.order !== undefined) {
    updates.order = req.body.order;
  }

  nano = await SubtaskNano.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true }
  ).populate(populateConfig);

  await refreshSubtaskNanoStats(nano.subtask);
  await refreshCardHierarchyStats(nano.task);

  emitToBoard(nano.board.toString(), 'hierarchy-nano-changed', {
    type: 'updated',
    subtaskId: nano.subtask.toString(),
    nano
  });
  const parentCard = await Card.findById(nano.task);
  invalidateHierarchyCache({
    boardId: parentCard?.board || nano.board,
    listId: parentCard?.list,
    cardId: nano.task,
    subtaskId: nano.subtask,
    subtaskNanoId: nano._id
  });

  res.status(200).json({
    success: true,
    data: nano
  });
});

export const deleteNano = asyncHandler(async (req, res, next) => {
  const nano = await SubtaskNano.findById(req.params.id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  await nano.deleteOne();

  await refreshSubtaskNanoStats(nano.subtask);
  await refreshCardHierarchyStats(nano.task);

  emitToBoard(nano.board.toString(), 'hierarchy-nano-changed', {
    type: 'deleted',
    subtaskId: nano.subtask.toString(),
    nanoId: nano._id
  });
  const parentCard = await Card.findById(nano.task);
  invalidateHierarchyCache({
    boardId: parentCard?.board || nano.board,
    listId: parentCard?.list,
    cardId: nano.task,
    subtaskId: nano.subtask,
    subtaskNanoId: nano._id
  });

  res.status(200).json({
    success: true,
    message: 'Subtask-Nano deleted'
  });
});

export const reorderNanos = asyncHandler(async (req, res, next) => {
  const { subtaskId } = req.params;
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds)) {
    return next(new ErrorResponse('orderedIds array is required', 400));
  }

  const updates = orderedIds.map((nanoId, idx) =>
    SubtaskNano.findByIdAndUpdate(nanoId, { order: idx })
  );
  await Promise.all(updates);

  const nanos = await getOrderedNanos(subtaskId);
  const subtask = await Subtask.findById(subtaskId);
  const parentCard = await Card.findById(subtask.task);

  emitToBoard(subtask.board.toString(), 'hierarchy-nano-changed', {
    type: 'reordered',
    subtaskId,
    nanos
  });
  invalidateHierarchyCache({
    boardId: parentCard?.board || subtask.board,
    listId: parentCard?.list,
    cardId: subtask.task,
    subtaskId
  });

  res.status(200).json({
    success: true,
    data: nanos
  });
});


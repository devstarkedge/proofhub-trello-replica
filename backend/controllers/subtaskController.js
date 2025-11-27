import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import { emitToBoard } from '../server.js';
import { refreshCardHierarchyStats } from '../utils/hierarchyStats.js';
import { invalidateHierarchyCache } from '../utils/cacheInvalidation.js';

const basePopulate = [
  { path: 'assignees', select: 'name email avatar' },
  { path: 'watchers', select: 'name email avatar' }
];

const buildBreadcrumbs = (card) => ({
  project: card?.board?.name || '',
  task: card?.title || ''
});

const getOrderedSubtasks = async (taskId) => {
  return Subtask.find({ task: taskId })
    .sort({ order: 1, createdAt: 1 })
    .populate(basePopulate);
};

export const getSubtasksForTask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const card = await Card.findById(taskId).populate('board', 'name');
  if (!card) {
    return next(new ErrorResponse('Task not found', 404));
  }

  const subtasks = await getOrderedSubtasks(taskId);

  res.status(200).json({
    success: true,
    data: subtasks
  });
});

export const getSubtaskById = asyncHandler(async (req, res, next) => {
  const subtask = await Subtask.findById(req.params.id)
    .populate(basePopulate)
    .populate({
      path: 'nanoSubtasks',
      options: { sort: { order: 1, createdAt: 1 } }
    });

  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  res.status(200).json({
    success: true,
    data: subtask
  });
});

export const createSubtask = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const card = await Card.findById(taskId).populate('board', 'name');
  if (!card) {
    return next(new ErrorResponse('Task not found', 404));
  }

  const currentCount = await Subtask.countDocuments({ task: taskId });
  const subtask = await Subtask.create({
    task: taskId,
    board: card.board,
    title: req.body.title,
    description: req.body.description,
    status: req.body.status || 'todo',
    priority: req.body.priority || 'medium',
    assignees: req.body.assignees || [],
    watchers: req.body.watchers || [],
    tags: req.body.tags || [],
    dueDate: req.body.dueDate,
    startDate: req.body.startDate,
    attachments: req.body.attachments || [],
    colorToken: req.body.colorToken || 'purple',
    estimationTime: req.body.estimationTime || [],
    loggedTime: req.body.loggedTime || [],
    billedTime: req.body.billedTime || [],
    order: req.body.order ?? currentCount,
    createdBy: req.user.id,
    breadcrumbs: buildBreadcrumbs(card)
  });

  const populated = await Subtask.findById(subtask._id).populate(basePopulate);

  await refreshCardHierarchyStats(taskId);

  emitToBoard(card.board.toString(), 'hierarchy-subtask-changed', {
    type: 'created',
    taskId,
    subtask: populated
  });

  invalidateHierarchyCache({
    boardId: card.board,
    listId: card.list,
    cardId: taskId,
    subtaskId: subtask._id
  });

  res.status(201).json({
    success: true,
    data: populated
  });
});

export const updateSubtask = asyncHandler(async (req, res, next) => {
  let subtask = await Subtask.findById(req.params.id).populate('task').populate('board');
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  const updates = {
    title: req.body.title ?? subtask.title,
    description: req.body.description ?? subtask.description,
    status: req.body.status ?? subtask.status,
    priority: req.body.priority ?? subtask.priority,
    assignees: req.body.assignees ?? subtask.assignees,
    watchers: req.body.watchers ?? subtask.watchers,
    tags: req.body.tags ?? subtask.tags,
    dueDate: req.body.dueDate ?? subtask.dueDate,
    startDate: req.body.startDate ?? subtask.startDate,
    attachments: req.body.attachments ?? subtask.attachments,
    colorToken: req.body.colorToken ?? subtask.colorToken,
    estimationTime: req.body.estimationTime ?? subtask.estimationTime,
    loggedTime: req.body.loggedTime ?? subtask.loggedTime,
    billedTime: req.body.billedTime ?? subtask.billedTime,
    updatedBy: req.user.id
  };

  if (req.body.order !== undefined) {
    updates.order = req.body.order;
  }

  subtask = await Subtask.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true }
  ).populate(basePopulate);

  await refreshCardHierarchyStats(subtask.task);

  emitToBoard(subtask.board.toString(), 'hierarchy-subtask-changed', {
    type: 'updated',
    taskId: subtask.task.toString(),
    subtask
  });
  const parentCard = await Card.findById(subtask.task);
  invalidateHierarchyCache({
    boardId: parentCard?.board || subtask.board,
    listId: parentCard?.list,
    cardId: subtask.task,
    subtaskId: subtask._id
  });

  res.status(200).json({
    success: true,
    data: subtask
  });
});

export const deleteSubtask = asyncHandler(async (req, res, next) => {
  const subtask = await Subtask.findById(req.params.id);
  if (!subtask) {
    return next(new ErrorResponse('Subtask not found', 404));
  }

  // Clean up related nanos
  await SubtaskNano.deleteMany({ subtask: subtask._id });

  await subtask.deleteOne();

  await refreshCardHierarchyStats(subtask.task);

  emitToBoard(subtask.board.toString(), 'hierarchy-subtask-changed', {
    type: 'deleted',
    taskId: subtask.task.toString(),
    subtaskId: subtask._id
  });

  const parentCard = await Card.findById(subtask.task);
  invalidateHierarchyCache({
    boardId: parentCard?.board || subtask.board,
    listId: parentCard?.list,
    cardId: subtask.task,
    subtaskId: subtask._id
  });

  res.status(200).json({
    success: true,
    message: 'Subtask deleted'
  });
});

export const reorderSubtasks = asyncHandler(async (req, res, next) => {
  const { taskId } = req.params;
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds)) {
    return next(new ErrorResponse('orderedIds array is required', 400));
  }

  const updates = orderedIds.map((subtaskId, idx) =>
    Subtask.findByIdAndUpdate(subtaskId, { order: idx })
  );
  await Promise.all(updates);

  const subtasks = await getOrderedSubtasks(taskId);
  const card = await Card.findById(taskId);

  emitToBoard(card.board.toString(), 'hierarchy-subtask-changed', {
    type: 'reordered',
    taskId,
    subtasks
  });
  invalidateHierarchyCache({
    boardId: card.board,
    listId: card.list,
    cardId: card._id
  });

  res.status(200).json({
    success: true,
    data: subtasks
  });
});


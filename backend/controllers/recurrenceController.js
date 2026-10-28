import { executeRecurrence } from '../services/recurrenceExecution.js';
import { authorizeProjectResource } from '../services/projectAuthorization.js';
import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import RecurringTask from '../models/RecurringTask.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import Activity from '../models/Activity.js';
import { emitToBoard } from '../realtime/index.js';
import { refreshCardHierarchyStats } from '../utils/hierarchyStats.js';
import {
  scheduleNextOccurrence,
  cancelRecurringSchedule,
  rescheduleOccurrence,
} from '../schedulers/recurringTaskScheduler.js';

// @desc    Create recurrence for a card
// @route   POST /api/recurrence
// @access  Private
export const createRecurrence = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'task', req.body.cardId, 'task.update');
  await authorizeProjectResource(req, 'task', req.body.cardId, 'task.create');
  const {
    cardId,
    scheduleType,
    dailyOptions,
    weeklyOptions,
    monthlyOptions,
    yearlyOptions,
    daysAfterOptions,
    customOptions,
    recurBehavior,
    taskOptions,
    endCondition,
    dueDate,
    dueTime,
    startDate,
    startTime,
    timezone,
    subtaskTemplate
  } = req.body;

  // Validate card exists
  const card = await Card.findById(cardId).populate('board', 'name');
  if (!card) {
    return next(new ErrorResponse('Card not found', 404));
  }

  // Check if recurrence already exists for this card
  const existingRecurrence = await RecurringTask.findOne({ card: cardId, isActive: true });
  if (existingRecurrence) {
    return next(new ErrorResponse('Active recurrence already exists for this card', 400));
  }

  const recurringData = { _id: new mongoose.Types.ObjectId(), workspaceId: req.workspaceId,
    card: cardId,
    board: card.board._id || card.board,
    createdBy: req.user.id,
    scheduleType,
    dailyOptions,
    weeklyOptions,
    monthlyOptions,
    yearlyOptions,
    daysAfterOptions,
    customOptions,
    recurBehavior: recurBehavior || 'onSchedule',
    taskOptions,
    endCondition,
    dueDate,
    dueTime: dueTime || '23:00',
    startDate,
    startTime,
    timezone: timezone || 'UTC',
    subtaskTemplate: subtaskTemplate || {
      title: card.title ? `${card.title} - Recurring` : 'Recurring Task',
      description: card.description || '',
      priority: card.priority || 'medium',
      assignees: card.assignees || [],
      tags: card.labels || []
    }
  };
  const session = await mongoose.startSession();
  let recurringTask, firstSubtask;
  try {
    await session.withTransaction(async () => {
      if (await RecurringTask.exists({ card: cardId, isActive: true }).session(session)) throw new ErrorResponse('Active recurrence already exists for this card', 409);
      recurringTask = new RecurringTask(recurringData);
      recurringTask.nextOccurrence = new Date(dueDate || Date.now());
      await recurringTask.save({ session });
      const result = await executeRecurrence(recurringTask._id, { occurrenceKey: 'initial', actorId: req.user.id, session });
      if (result.skipped) throw new ErrorResponse('The recurrence has already ended', 400);
      recurringTask = result.recurrence; firstSubtask = result.subtask;
    });
  } finally { await session.endSession(); }
  await refreshCardHierarchyStats(cardId);
  emitToBoard(recurringTask.board.toString(), 'recurrence-created', { cardId, recurrence: recurringTask, subtask: firstSubtask });
  emitToBoard(recurringTask.board.toString(), 'hierarchy-subtask-changed', { type: 'created', taskId: cardId, subtask: firstSubtask });

  // Schedule the next occurrence as a delayed BullMQ job
  scheduleNextOccurrence(recurringTask).catch(err =>
    console.error('Failed to schedule next occurrence:', err.message)
  );

  // Log activity
  await Activity.create({
    type: 'recurrence_created',
    description: `Set up recurring schedule: ${scheduleType}`,
    user: req.user.id,
    board: recurringTask.board,
    card: cardId,
    contextType: 'card',
    metadata: {
      scheduleType,
      recurBehavior
    }
  });

  const populated = await RecurringTask.findById(recurringTask._id)
    .populate('card', 'title')
    .populate('board', 'name')
    .populate('createdBy', 'name email')
    .populate('subtaskTemplate.assignees', 'name email avatar');

  res.status(201).json({
    success: true,
    data: populated
  });
});

// @desc    Get recurrence for a card
// @route   GET /api/recurrence/card/:cardId
// @access  Private
export const getRecurrenceByCard = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'task', req.params.cardId, 'task.view');
  const { cardId } = req.params;

  const recurrence = await RecurringTask.findOne({ card: cardId, isActive: true })
    .populate('card', 'title')
    .populate('board', 'name')
    .populate('createdBy', 'name email')
    .populate('subtaskTemplate.assignees', 'name email avatar')
    .populate({
      path: 'generatedSubtasks',
      select: 'title status dueDate createdAt',
      options: { sort: { createdAt: -1 }, limit: 10 }
    });

  res.status(200).json({
    success: true,
    data: recurrence
  });
});

// @desc    Get recurrence by ID
// @route   GET /api/recurrence/:id
// @access  Private
export const getRecurrenceById = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'recurrence', req.params.id, 'task.view');
  const recurrence = await RecurringTask.findById(req.params.id)
    .populate('card', 'title')
    .populate('board', 'name')
    .populate('createdBy', 'name email')
    .populate('subtaskTemplate.assignees', 'name email avatar')
    .populate({
      path: 'generatedSubtasks',
      select: 'title status dueDate createdAt',
      options: { sort: { createdAt: -1 } }
    });

  if (!recurrence) {
    return next(new ErrorResponse('Recurrence not found', 404));
  }

  res.status(200).json({
    success: true,
    data: recurrence
  });
});

// @desc    Get all recurrences for a project/board
// @route   GET /api/recurrence/all/:boardId
// @access  Private
export const getAllRecurrences = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'project', req.params.boardId, 'task.view');
  const { boardId } = req.params;
  const { includeInactive } = req.query;

  const query = { board: boardId };
  if (!includeInactive) {
    query.isActive = true;
  }

  const recurrences = await RecurringTask.find(query)
    .populate('card', 'title status priority dueDate')
    .populate('board', 'name')
    .populate('createdBy', 'name email')
    .populate('subtaskTemplate.assignees', 'name email avatar')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: recurrences.length,
    data: recurrences
  });
});

// @desc    Update recurrence
// @route   PATCH /api/recurrence/:id
// @access  Private
export const updateRecurrence = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'recurrence', req.params.id, 'task.update');
  let recurrence = await RecurringTask.findById(req.params.id);

  if (!recurrence) {
    return next(new ErrorResponse('Recurrence not found', 404));
  }

  const {
    scheduleType,
    dailyOptions,
    weeklyOptions,
    monthlyOptions,
    yearlyOptions,
    daysAfterOptions,
    customOptions,
    recurBehavior,
    taskOptions,
    endCondition,
    dueDate,
    dueTime,
    startDate,
    startTime,
    timezone,
    subtaskTemplate,
    isActive
  } = req.body;

  // Update fields
  if (scheduleType !== undefined) recurrence.scheduleType = scheduleType;
  if (dailyOptions !== undefined) recurrence.dailyOptions = dailyOptions;
  if (weeklyOptions !== undefined) recurrence.weeklyOptions = weeklyOptions;
  if (monthlyOptions !== undefined) recurrence.monthlyOptions = monthlyOptions;
  if (yearlyOptions !== undefined) recurrence.yearlyOptions = yearlyOptions;
  if (daysAfterOptions !== undefined) recurrence.daysAfterOptions = daysAfterOptions;
  if (customOptions !== undefined) recurrence.customOptions = customOptions;
  if (recurBehavior !== undefined) recurrence.recurBehavior = recurBehavior;
  if (taskOptions !== undefined) recurrence.taskOptions = taskOptions;
  if (endCondition !== undefined) recurrence.endCondition = endCondition;
  if (dueDate !== undefined) recurrence.dueDate = dueDate;
  if (dueTime !== undefined) recurrence.dueTime = dueTime;
  if (startDate !== undefined) recurrence.startDate = startDate;
  if (startTime !== undefined) recurrence.startTime = startTime;
  if (timezone !== undefined) recurrence.timezone = timezone;
  if (subtaskTemplate !== undefined) recurrence.subtaskTemplate = subtaskTemplate;
  if (isActive !== undefined) recurrence.isActive = isActive;

  // Recalculate next occurrence if schedule changed
  if (scheduleType || dueDate) {
    recurrence.nextOccurrence = recurrence.calculateNextOccurrence(
      dueDate ? new Date(dueDate) : new Date()
    );
  }

  await recurrence.save();

  // Reschedule or cancel the delayed BullMQ job based on active state
  if (recurrence.isActive && recurrence.nextOccurrence) {
    rescheduleOccurrence(recurrence).catch(console.error);
  } else if (!recurrence.isActive) {
    cancelRecurringSchedule(recurrence._id).catch(console.error);
  }

  // Log activity
  await Activity.create({
    type: 'recurrence_updated',
    description: `Updated recurring schedule`,
    user: req.user.id,
    board: recurrence.board,
    card: recurrence.card,
    contextType: 'card',
    metadata: {
      scheduleType: recurrence.scheduleType
    }
  });

  // Emit real-time update
  emitToBoard(recurrence.board.toString(), 'recurrence-updated', {
    cardId: recurrence.card,
    recurrence
  });

  const populated = await RecurringTask.findById(recurrence._id)
    .populate('card', 'title')
    .populate('board', 'name')
    .populate('createdBy', 'name email')
    .populate('subtaskTemplate.assignees', 'name email avatar');

  res.status(200).json({
    success: true,
    data: populated
  });
});

// @desc    Stop/Delete recurrence
// @route   DELETE /api/recurrence/:id
// @access  Private
export const deleteRecurrence = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'recurrence', req.params.id, 'task.update');
  const recurrence = await RecurringTask.findById(req.params.id);

  if (!recurrence) {
    return next(new ErrorResponse('Recurrence not found', 404));
  }

  const { hardDelete } = req.query;

  if (hardDelete === 'true') {
    await RecurringTask.findByIdAndDelete(req.params.id);
  } else {
    // Soft delete - just deactivate
    recurrence.isActive = false;
    await recurrence.save();
  }

  // Cancel any pending delayed job
  cancelRecurringSchedule(recurrence._id).catch(console.error);

  // Log activity
  await Activity.create({
    type: 'recurrence_stopped',
    description: `Stopped recurring schedule`,
    user: req.user.id,
    board: recurrence.board,
    card: recurrence.card,
    contextType: 'card'
  });

  // Emit real-time update
  emitToBoard(recurrence.board.toString(), 'recurrence-stopped', {
    cardId: recurrence.card,
    recurrenceId: recurrence._id
  });

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Trigger immediate recurrence (for testing or manual trigger)
// @route   POST /api/recurrence/:id/trigger
// @access  Private
export const triggerRecurrence = asyncHandler(async (req, res, next) => {
  await authorizeProjectResource(req, 'recurrence', req.params.id, 'task.create');
  let recurrence = await RecurringTask.findById(req.params.id);

  if (!recurrence) {
    return next(new ErrorResponse('Recurrence not found', 404));
  }

  if (!recurrence.isActive) {
    return next(new ErrorResponse('Recurrence is not active', 400));
  }

  // Check end conditions
  if (recurrence.shouldEnd()) {
    recurrence.isActive = false;
    await recurrence.save();
    return next(new ErrorResponse('Recurrence has ended', 400));
  }

  const expectedOccurrence = recurrence.nextOccurrence;
  const result = await executeRecurrence(recurrence._id, {
    occurrenceKey: expectedOccurrence && recurrence.recurBehavior === 'onSchedule' ? `scheduled:${new Date(expectedOccurrence).toISOString()}` : `manual:${recurrence.completedOccurrences}`,
    expectedOccurrence, actorId: req.user.id
  });
  if (result.skipped) throw new ErrorResponse('Recurrence changed; refresh and retry', 409);
  const { subtask } = result;
  recurrence = result.recurrence;

  // Refresh card hierarchy stats
  await refreshCardHierarchyStats(recurrence.card);

  // Emit real-time updates
  emitToBoard(recurrence.board.toString(), 'recurrence-triggered', {
    cardId: recurrence.card,
    recurrence,
    subtask
  });

  emitToBoard(recurrence.board.toString(), 'hierarchy-subtask-changed', {
    type: 'created',
    taskId: recurrence.card,
    subtask
  });

  const populatedSubtask = await Subtask.findById(subtask._id)
    .populate('assignees', 'name email avatar');

  res.status(200).json({
    success: true,
    data: {
      recurrence,
      subtask: populatedSubtask
    }
  });
});

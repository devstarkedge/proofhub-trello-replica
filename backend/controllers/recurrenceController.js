import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import RecurringTask from '../models/RecurringTask.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import Activity from '../models/Activity.js';
import { emitToBoard } from '../server.js';
import { refreshCardHierarchyStats } from '../utils/hierarchyStats.js';

// Helper: Generate subtask from recurring task
const generateRecurringSubtask = async (recurringTask, userId) => {
  const card = await Card.findById(recurringTask.card).populate('board', 'name');
  if (!card) {
    throw new Error('Parent card not found');
  }

  const currentCount = await Subtask.countDocuments({ task: recurringTask.card });
  
  // Calculate dates based on template
  let subtaskDueDate = recurringTask.nextOccurrence;
  let subtaskStartDate = null;
  
  if (recurringTask.startDate && recurringTask.dueDate) {
    const daysDiff = Math.ceil((new Date(recurringTask.dueDate) - new Date(recurringTask.startDate)) / (1000 * 60 * 60 * 24));
    subtaskStartDate = new Date(subtaskDueDate);
    subtaskStartDate.setDate(subtaskStartDate.getDate() - daysDiff);
  }

  const template = recurringTask.subtaskTemplate || {};
  const parentTitle = card.title || 'Task';
  
  // Filter tags to ensure only valid ObjectIds are included
  const validTags = (template.tags || []).filter(tag => {
    // Check if tag is a valid ObjectId or can be converted to one
    return tag && mongoose.Types.ObjectId.isValid(tag);
  });
  
  const subtask = await Subtask.create({
    task: recurringTask.card,
    board: recurringTask.board,
    title: template.title || `${parentTitle} - Recurring Instance`,
    description: template.description || '',
    status: 'todo',
    priority: template.priority || 'medium',
    assignees: template.assignees || [],
    tags: validTags,
    dueDate: subtaskDueDate,
    startDate: subtaskStartDate,
    order: currentCount,
    createdBy: userId,
    isRecurring: true,
    recurringTaskId: recurringTask._id,
    breadcrumbs: {
      project: card.board?.name || '',
      task: card.title || ''
    }
  });

  return subtask;
};

// @desc    Create recurrence for a card
// @route   POST /api/recurrence
// @access  Private
export const createRecurrence = asyncHandler(async (req, res, next) => {
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

  // Create recurring task
  const recurringTask = await RecurringTask.create({
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
  });

  // Calculate and set next occurrence
  const nextOccurrence = recurringTask.calculateNextOccurrence(new Date(dueDate || Date.now()));
  recurringTask.nextOccurrence = nextOccurrence;
  await recurringTask.save();

  // Create first recurring subtask immediately
  try {
    const firstSubtask = await generateRecurringSubtask(recurringTask, req.user.id);
    recurringTask.generatedSubtasks.push(firstSubtask._id);
    recurringTask.completedOccurrences = 1;
    recurringTask.lastOccurrence = new Date();
    
    // Calculate next occurrence after first creation
    recurringTask.nextOccurrence = recurringTask.calculateNextOccurrence();
    await recurringTask.save();

    // Refresh card hierarchy stats
    await refreshCardHierarchyStats(cardId);

    // Emit real-time update
    emitToBoard(recurringTask.board.toString(), 'recurrence-created', {
      cardId,
      recurrence: recurringTask,
      subtask: firstSubtask
    });

    emitToBoard(recurringTask.board.toString(), 'hierarchy-subtask-changed', {
      type: 'created',
      taskId: cardId,
      subtask: firstSubtask
    });
  } catch (error) {
    console.error('Error creating first recurring subtask:', error);
  }

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
  const recurrence = await RecurringTask.findById(req.params.id);

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

  // Generate new subtask
  const subtask = await generateRecurringSubtask(recurrence, req.user.id);
  
  // Update recurrence
  recurrence.generatedSubtasks.push(subtask._id);
  recurrence.completedOccurrences += 1;
  recurrence.lastOccurrence = new Date();
  recurrence.nextOccurrence = recurrence.calculateNextOccurrence();
  
  // Check if should end after this occurrence
  if (recurrence.shouldEnd()) {
    recurrence.isActive = false;
  }
  
  await recurrence.save();

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

// Export helper for scheduler
export { generateRecurringSubtask };

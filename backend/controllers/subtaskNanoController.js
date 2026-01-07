import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import { emitToBoard } from '../server.js';
import { refreshCardHierarchyStats, refreshSubtaskNanoStats } from '../utils/hierarchyStats.js';
import { invalidateHierarchyCache } from '../utils/cacheInvalidation.js';
import { batchCreateActivities, executeBackgroundTasks } from '../utils/activityLogger.js';

const populateConfig = [
  { path: 'assignees', select: 'name email avatar' },
  { path: 'tags', select: 'name color' },
  { path: 'coverImage', select: 'url secureUrl publicId height width' },
  { path: 'estimationTime.user', select: 'name email avatar' },
  { path: 'loggedTime.user', select: 'name email avatar' },
  { path: 'billedTime.user', select: 'name email avatar' }
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

  // Parallelize secondary operations
  await Promise.all([
    // Log activity
    Activity.create({
      type: 'nano_created',
      description: `Created nano-subtask "${nano.title}"`,
      user: req.user.id,
      board: subtask.board,
      card: subtask.task,
      subtask: subtaskId,
      nanoSubtask: nano._id,
      contextType: 'nanoSubtask',
      metadata: {
        nanoTitle: nano.title,
        title: nano.title
      }
    }),

    // Update stats
    refreshSubtaskNanoStats(subtaskId),
    refreshCardHierarchyStats(subtask.task),

    // Emit socket event
    Promise.resolve().then(() => {
        emitToBoard(subtask.board.toString(), 'hierarchy-nano-changed', {
            type: 'created',
            subtaskId,
            nano: populated
        });
    }),

    // Invalidate cache
    Promise.resolve().then(() => {
        invalidateHierarchyCache({
            boardId: subtask.board,
            listId: card?.list,
            cardId: subtask.task,
            subtaskId,
            subtaskNanoId: nano._id
        });
    })
  ]);

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

  const oldNano = { ...nano.toObject() };
  const boardId = nano.board;
  const taskId = nano.task;
  const subtaskId = nano.subtask;

  // Helper function to extract user ID from object or string
  const extractUserId = (user, fallbackUserId) => {
    if (!user) return fallbackUserId;
    if (typeof user === 'object' && user._id) return user._id;
    if (typeof user === 'string') return user;
    return fallbackUserId;
  };

  // Process time tracking entries to ensure proper user IDs
  const processTimeEntries = (entries, existingEntries) => {
    if (!entries) return existingEntries;
    return entries.map(entry => {
      // For new entries (no _id), always use authenticated user for security
      if (!entry._id && !entry.id?.includes('-')) {
        return { ...entry, user: req.user.id };
      }
      // Check if this is a new entry with frontend-generated id
      const isNewEntry = entry.id && typeof entry.id === 'string' && entry.id.includes('-');
      if (isNewEntry) {
        return { ...entry, user: req.user.id };
      }
      // For existing entries, extract user ID if it's an object
      return { ...entry, user: extractUserId(entry.user, entry.user) };
    });
  };

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
    estimationTime: processTimeEntries(req.body.estimationTime, nano.estimationTime),
    loggedTime: processTimeEntries(req.body.loggedTime, nano.loggedTime),
    billedTime: processTimeEntries(req.body.billedTime, nano.billedTime),
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

  // Send response immediately for better UX
  res.status(200).json({
    success: true,
    data: nano
  });

  // Execute background tasks after response is sent
  executeBackgroundTasks([
    // Batch activity logging
    async () => {
      const activities = [];
      const baseActivity = {
        user: req.user.id,
        board: boardId,
        card: taskId,
        subtask: subtaskId,
        nanoSubtask: nano._id,
        contextType: 'nanoSubtask'
      };

      if (oldNano.title !== nano.title) {
        activities.push({
          ...baseActivity,
          type: 'title_changed',
          description: `Changed title from "${oldNano.title}" to "${nano.title}"`
        });
      }
      if (oldNano.status !== nano.status) {
        activities.push({
          ...baseActivity,
          type: 'status_changed',
          description: `Changed status from ${oldNano.status} to ${nano.status}`
        });
      }
      if (oldNano.priority !== nano.priority) {
        activities.push({
          ...baseActivity,
          type: 'priority_changed',
          description: `Changed priority from ${oldNano.priority} to ${nano.priority}`
        });
      }
      if (oldNano.description !== nano.description) {
        activities.push({
          ...baseActivity,
          type: 'description_changed',
          description: 'Updated the description'
        });
      }
      if (oldNano.dueDate?.toString() !== nano.dueDate?.toString()) {
        activities.push({
          ...baseActivity,
          type: 'due_date_changed',
          description: `Changed due date to ${nano.dueDate}`
        });
      }
      if (JSON.stringify(oldNano.assignees) !== JSON.stringify(nano.assignees)) {
        activities.push({
          ...baseActivity,
          type: 'member_added',
          description: 'Updated assignees'
        });
      }
      if (JSON.stringify(oldNano.loggedTime) !== JSON.stringify(nano.loggedTime)) {
        activities.push({
          ...baseActivity,
          type: 'time_logged',
          description: 'Updated logged time'
        });
      }

      if (activities.length > 0) {
        await batchCreateActivities(activities);
      }
    },

    // Refresh stats in parallel
    () => Promise.all([
      refreshSubtaskNanoStats(subtaskId),
      refreshCardHierarchyStats(taskId)
    ]),

    // Emit socket event
    () => emitToBoard(boardId.toString(), 'hierarchy-nano-changed', {
      type: 'updated',
      subtaskId: subtaskId.toString(),
      nano
    }),

    // Invalidate cache
    async () => {
      const parentCard = await Card.findById(taskId).select('board list').lean();
      invalidateHierarchyCache({
        boardId: parentCard?.board || boardId,
        listId: parentCard?.list,
        cardId: taskId,
        subtaskId,
        subtaskNanoId: nano._id
      });
    }
  ]);
});

export const deleteNano = asyncHandler(async (req, res, next) => {
  const nano = await SubtaskNano.findById(req.params.id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  const nanoTitle = nano.title;
  const subtaskId = nano.subtask;
  const taskId = nano.task;
  const boardId = nano.board;

  await nano.deleteOne();

  // Log activity
  await Activity.create({
    type: 'nano_deleted',
    description: `Deleted nano-subtask "${nanoTitle}"`,
    user: req.user.id,
    board: boardId,
    card: taskId,
    subtask: subtaskId,
    nanoSubtask: nano._id,
    contextType: 'nanoSubtask',
    metadata: {
      nanoTitle
    }
  });

  await refreshSubtaskNanoStats(subtaskId);
  await refreshCardHierarchyStats(taskId);

  emitToBoard(boardId.toString(), 'hierarchy-nano-changed', {
    type: 'deleted',
    subtaskId: subtaskId.toString(),
    nanoId: nano._id
  });
  const parentCard = await Card.findById(taskId);
  invalidateHierarchyCache({
    boardId: parentCard?.board || boardId,
    listId: parentCard?.list,
    cardId: taskId,
    subtaskId: subtaskId,
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

// @desc    Get nano-subtask activity logs
// @route   GET /api/subtask-nanos/:id/activity
// @access  Private
export const getNanoActivity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 100, page = 1 } = req.query;

  // Verify nano-subtask exists
  const nano = await SubtaskNano.findById(id);
  if (!nano) {
    return next(new ErrorResponse('Subtask-Nano not found', 404));
  }

  // Get all activities for this nano-subtask - filter by both nanoSubtask reference and contextType
  const activities = await Activity.find({ 
    nanoSubtask: id,
    contextType: 'nanoSubtask'
  })
    .populate('user', 'name email avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  const total = await Activity.countDocuments({ 
    nanoSubtask: id,
    contextType: 'nanoSubtask'
  });

  res.status(200).json({
    success: true,
    count: activities.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: activities,
  });
});



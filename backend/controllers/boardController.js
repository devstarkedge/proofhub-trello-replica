import Board from "../models/Board.js";
import List from "../models/List.js";
import Card from "../models/Card.js";
import Attachment from "../models/Attachment.js";
import Label from "../models/Label.js";
import Activity from "../models/Activity.js";
import Department from "../models/Department.js";
import Notification from "../models/Notification.js";
import RecurringTask from "../models/RecurringTask.js";
import Reminder from "../models/Reminder.js";
import Subtask from "../models/Subtask.js";
import SubtaskNano from "../models/SubtaskNano.js";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";
import { emitNotification } from "../server.js";
import notificationService from "../utils/notificationService.js";
import { slackHooks } from "../utils/slackHooks.js";
import { 
  notifyProjectCreatedInBackground, 
  sendProjectEmailsInBackground, 
  logProjectActivityInBackground,
  invalidateCacheInBackground 
} from "../utils/backgroundTasks.js";
import {
  uploadProjectCover,
  validateCoverImage,
  deleteProjectCover
} from "../utils/cloudinary.js";

// @desc    Get all boards for user
// @route   GET /api/boards
// @access  Private
export const getBoards = asyncHandler(async (req, res, next) => {
  let query = {
    $or: [{ owner: req.user.id }, { members: req.user.id }],
  };

  // Include public projects for managers and admins
  if (req.user.role === 'admin' || req.user.role === 'manager') {
    query.$or.push({ visibility: 'public' });
  }

  if (req.user.team) {
    query.$or.push({ team: req.user.team });
  }

  const boards = await Board.find(query)
    .populate("owner", "name email avatar")
    .populate("team", "name")
    .populate("department", "name")
    .populate("members", "name email avatar")
    .sort("-createdAt")
    .lean(); // Use lean() for read-only operations - ~5x faster

  res.status(200).json({
    success: true,
    count: boards.length,
    data: boards,
  });
});

// @desc    Get boards by department
// @route   GET /api/boards/department/:departmentId
// @access  Private
export const getBoardsByDepartment = asyncHandler(async (req, res, next) => {
  const { departmentId } = req.params;

  const boards = await Board.find({
    department: departmentId,
    isArchived: false
  })
    .populate("owner", "name email avatar")
    .populate("team", "name")
    .populate("members", "name email avatar")
    .sort("-createdAt")
    .lean(); // Use lean() for read-only operations

  res.status(200).json({
    success: true,
    count: boards.length,
    data: boards,
  });
});

// @desc    Get complete workflow data (board + lists + cards) in single request
// @route   GET /api/boards/:id/workflow-complete
// @access  Private
export const getWorkflowComplete = asyncHandler(async (req, res, next) => {
  const { id: projectId } = req.params;

  // Fetch board and lists in parallel
  // Also fetch subtasks and nanos to aggregate complete team
  const [board, lists, subtasks, nanos] = await Promise.all([
    Board.findById(projectId)
      .populate('owner', 'name email avatar role')
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('members', 'name email avatar role')
      .lean(),
    List.find({ board: projectId, isArchived: false })
      .sort('position')
      .lean(),
    Subtask.find({ board: projectId }).select('assignees').lean(),
    SubtaskNano.find({ board: projectId }).select('assignees').lean()
  ]);

  if (!board) {
    return next(new ErrorResponse('Board not found', 404));
  }

  // Check access
  const hasAccess =
    board.owner?._id?.toString() === req.user.id ||
    board.members?.some((m) => m?._id?.toString() === req.user.id) ||
    board.visibility === 'public' ||
    req.user.role === 'admin';

  if (!hasAccess) {
    return next(new ErrorResponse('Not authorized to access this board', 403));
  }

  // Fetch all cards for all lists in one query - ONLY ACTIVE (NON-ARCHIVED) CARDS
  const listIds = lists.map(l => l._id);
  const cards = await Card.find({ list: { $in: listIds }, isArchived: false })
    .select('title list description position status priority labels assignees board coverImage startDate dueDate estimation start_date end_date subtaskStats loggedTime')
    .populate('assignees', 'name email avatar role')
    .populate('members', 'name email avatar')
    .populate('coverImage', 'url secureUrl thumbnailUrl fileName fileType isCover')
    .sort({ list: 1, position: 1 })
    .lean();

  // --- AGGREGATE ALL PROJECT MEMBERS ---
  const memberMap = new Map();
  
  // Helper to add user to map
  const addUser = (user) => {
    if (!user) return;
    // Handle both populated object and direct ID
    const id = user._id ? user._id.toString() : user.toString();
    
    if (user._id && !memberMap.has(id)) {
      memberMap.set(id, user); // Prefer populated user
    } else if (!memberMap.has(id)) {
      memberMap.set(id, { _id: id }); // Placeholder with just ID
    }
  };

  // 1. Board Owner
  if (board.owner) addUser(board.owner);

  // 2. Board Members (explicitly assigned)
  if (board.members) board.members.forEach(addUser);

  // 3. Card Assignees
  cards.forEach(card => {
    if (card.assignees) card.assignees.forEach(addUser);
  });

  // 4. Subtask Assignees
  subtasks.forEach(task => {
    if (task.assignees) task.assignees.forEach(addUser);
  });

  // 5. Nano Assignees
  nanos.forEach(nano => {
    if (nano.assignees) nano.assignees.forEach(addUser);
  });

  // Identify missing user details (IDs that are just strings/placeholders without name)
  const missingUserIds = [];
  memberMap.forEach((val, key) => {
     if (!val.name) missingUserIds.push(key);
  });

  // Fetch details for missing users
  if (missingUserIds.length > 0) {
      const users = await User.find({ _id: { $in: missingUserIds } }).select('name email avatar role').lean();
      users.forEach(u => memberMap.set(u._id.toString(), u));
  }

  // Update board members with the complete aggregated list
  // Only include valid users (must have name/email)
  board.members = Array.from(memberMap.values()).filter(u => u.name);
  // -------------------------------------

  // Fetch all labels for this board for manual population
  const allLabels = await Label.find({ board: projectId }).select('name color').lean();
  const labelMap = new Map(allLabels.map(l => [l._id.toString(), l]));

  // Populate labels manually (handles both ObjectId and string formats)
  const cardsWithLabels = cards.map(card => {
    if (card.labels && card.labels.length > 0) {
      card.labels = card.labels
        .map(labelId => {
          const idStr = typeof labelId === 'object' ? labelId._id?.toString() || labelId.toString() : labelId.toString();
          return labelMap.get(idStr) || null;
        })
        .filter(Boolean);
    }
    return card;
  });

  // Fetch recurrence status in batch
  const cardIds = cardsWithLabels.map(c => c._id);
  const recurringTasks = await RecurringTask.find({
    card: { $in: cardIds },
    isActive: true
  }).select('card').lean();

  const recurringSet = new Set(recurringTasks.map(r => r.card.toString()));

  // Fetch attachment counts for these cards in batch to avoid extra per-card queries
  const attachmentCountsAgg = await Attachment.aggregate([
    { $match: { card: { $in: cardIds }, isDeleted: false } },
    { $group: { _id: '$card', count: { $sum: 1 } } }
  ]);
  const attachmentCountMap = new Map(attachmentCountsAgg.map(a => [a._id.toString(), a.count]));

  // Group cards by list and add hasRecurrence flag
  const cardsByList = {};
  listIds.forEach(id => { cardsByList[id.toString()] = []; });
  
  cardsWithLabels.forEach(card => {
    const listId = card.list.toString();
    if (cardsByList[listId]) {
      cardsByList[listId].push({
        ...card,
        hasRecurrence: recurringSet.has(card._id.toString()),
        attachmentsCount: attachmentCountMap.get(card._id.toString()) || 0
      });
    }
  });

  res.status(200).json({
    success: true,
    data: {
      board,
      lists,
      cardsByList
    }
  });
});

// @desc    Get workflow data by department and project
// @route   GET /api/boards/workflow/:departmentId/:projectId
// @access  Private
export const getWorkflowData = asyncHandler(async (req, res, next) => {
  const { departmentId, projectId } = req.params;

  const board = await Board.findById(projectId)
    .populate("owner", "name email avatar role")
    .populate("team", "name")
    .populate("department", "name")
    .populate("members", "name email avatar role")
    .lean(); // Use lean() for read-only operations

  if (!board) {
    return next(new ErrorResponse("Project not found", 404));
  }

  // Verify the project belongs to the specified department
  const boardDepartmentId =
    (typeof board.department === "object" && board.department?._id) ||
    board.department;

  if (!boardDepartmentId || boardDepartmentId.toString() !== departmentId) {
    return next(new ErrorResponse("This project does not belong to the specified department", 403));
  }

  // Check access
  const hasAccess =
    board.owner?._id?.toString() === req.user.id ||
    board.members?.some((m) => m?._id?.toString() === req.user.id) ||
    board.visibility === "public" ||
    req.user.role === "admin" ||
    (req.user.department && req.user.department.toString() === departmentId);

  if (!hasAccess) {
    return next(new ErrorResponse("Not authorized to access this project workflow", 403));
  }

  res.status(200).json({
    success: true,
    data: board,
  });
});

// @desc    Get single board
// @route   GET /api/boards/:id
// @access  Private
export const getBoard = asyncHandler(async (req, res, next) => {
  const board = await Board.findById(req.params.id)
    .populate("owner", "name email avatar")
    .populate("team", "name")
    .populate("department", "name")
    .populate("members", "name email avatar");

  if (!board) {
    return next(new ErrorResponse("Board not found", 404));
  }

  // Check access
  const ownerId =
    (typeof board.owner === "object" && board.owner?._id) ||
    board.owner;
  const hasAccess =
    ownerId?.toString() === req.user.id ||
    board.members?.some((m) => m?._id?.toString() === req.user.id) ||
    board.visibility === "public";

  if (!hasAccess) {
    return next(new ErrorResponse("Not authorized to access this board", 403));
  }

  // Calculate progress based on active (non-archived) cards only
  const cards = await Card.find({ board: board._id, isArchived: false }).select('status');
  const totalCards = cards.length;
  const completedCards = cards.filter(card => card.status === 'done').length;
  const progress = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;

  // Convert to plain object and add progress
  const boardData = board.toObject();
  boardData.progress = progress;
  boardData.totalCards = totalCards;
  boardData.completedCards = completedCards;

  res.status(200).json({
    success: true,
    data: boardData,
  });
});

// @desc    Create board
// @route   POST /api/boards
// @access  Private
export const createBoard = asyncHandler(async (req, res, next) => {
  const {
    name,
    description,
    team,
    department,
    members,
    visibility,
    background,
    startDate,
    dueDate,
    labels,
    estimatedTime,
    status,
    priority,
    projectUrl,
    projectSource,
    upworkId,
    billingCycle,
    fixedPrice,
    hourlyPrice,
    clientDetails,
    projectCategory
  } = req.body;

  // Handle file attachments
  let attachments = [];
  if (req.files && req.files.length > 0) {
    attachments = req.files.map(file => ({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path
    }));
  }

  // Department is required
  const projectDepartment = department || req.user.department;
  if (!projectDepartment) {
    return next(
      new ErrorResponse(
        "Department is required to create a project",
        400
      )
    );
  }

  // Managers can only create boards for their department
  if (
    req.user.role === "manager" &&
    projectDepartment.toString() !== req.user.department?.toString()
  ) {
    return next(
      new ErrorResponse(
        "Managers can only create boards for their department",
        403
      )
    );
  }

  // Check if background tasks should be used (for optimistic UI)
  const runBackgroundTasks = req.body.runBackgroundTasks === true;

  const board = await Board.create({
    name,
    description,
    team: team || req.user.team,
    department: projectDepartment,
    owner: req.user.id,
    members: members || [req.user.id],
    visibility: visibility || "public",
    background: background || "#6366f1",
    startDate,
    dueDate,
    labels: labels || [],
    estimatedTime,
    status: status || "planning",
    priority: priority || "medium",
    attachments,
    projectUrl,
    projectSource,
    upworkId,
    billingCycle,
    fixedPrice,
    hourlyPrice,
    clientDetails,
    projectCategory
  });

  // Add board to department's projects array
  await Department.findByIdAndUpdate(board.department, {
    $push: { projects: board._id }
  });

  // Create default lists (essential, do synchronously)
  const defaultLists = ["To Do", "In Progress", "Review", "Done"];
  const listPromises = defaultLists.map((title, i) => 
    List.create({
      title,
      board: board._id,
      position: i,
    })
  );
  await Promise.all(listPromises);

  // Populate board for response (essential, do synchronously)
  const populatedBoard = await Board.findById(board._id)
    .populate("owner", "name email avatar")
    .populate("team", "name")
    .populate("department", "name")
    .populate("members", "name email avatar");

  // Send response immediately for fast UI update
  res.status(201).json({
    success: true,
    data: populatedBoard,
  });

  // Run heavy tasks in background (after response is sent)
  if (runBackgroundTasks) {
    // Log activity in background
    logProjectActivityInBackground({
      type: "board_created",
      description: `Created board "${name}"`,
      user: req.user.id,
      board: board._id,
    });

    // Send notifications in background
    notifyProjectCreatedInBackground(board, req.user.id);

    // Send emails to members in background
    if (members && members.length > 0) {
      sendProjectEmailsInBackground(board, members);
    }

    // Invalidate caches in background
    invalidateCacheInBackground([
      `/api/boards`,
      `/api/boards/department/${board.department}`,
      "/api/departments",
      "/api/analytics/dashboard"
    ]);
  } else {
    // Synchronous fallback for non-optimistic requests
    await Activity.create({
      type: "board_created",
      description: `Created board "${name}"`,
      user: req.user.id,
      board: board._id,
    });

    await notificationService.notifyProjectCreated(board, req.user.id);

    invalidateCache(`/api/boards`);
    invalidateCache(`/api/boards/department/${board.department}`);
    invalidateCache("/api/departments");
    invalidateCache("/api/analytics/dashboard");
  }
});

// @desc    Update board
// @route   PUT /api/boards/:id
// @access  Private
export const updateBoard = asyncHandler(async (req, res, next) => {
  let board = await Board.findById(req.params.id);

  if (!board) {
    return next(new ErrorResponse("Board not found", 404));
  }

  // Check ownership - allow admin and manager roles to update
  const ownerId = board.owner && typeof board.owner === 'object' ? board.owner._id?.toString() : board.owner?.toString();
  if (ownerId !== req.user.id && req.user.role !== "admin" && req.user.role !== "manager") {
    return next(new ErrorResponse("Not authorized to update this board", 403));
  }

  const previousBoard = board.toObject();

  board = await Board.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate("owner", "name email avatar")
    .populate("members", "name email avatar");

  // Activity + notifications
  const changes = [];
  const activityTasks = [];

  if (req.body.name && req.body.name !== previousBoard.name) {
    changes.push(`Name updated to "${req.body.name}"`);
    activityTasks.push(Activity.create({
      type: 'project_updated',
      description: `Renamed project to "${req.body.name}"`,
      user: req.user.id,
      board: board._id,
      contextType: 'board'
    }));
  }

  if (typeof req.body.description === 'string' && req.body.description !== previousBoard.description) {
    changes.push('Description updated');
    activityTasks.push(Activity.create({
      type: 'project_updated',
      description: 'Updated project description',
      user: req.user.id,
      board: board._id,
      contextType: 'board'
    }));
  }

  if (req.body.status && req.body.status !== previousBoard.status) {
    changes.push(`Status changed to ${req.body.status}`);
    activityTasks.push(Activity.create({
      type: 'project_status_changed',
      description: `Status changed to ${req.body.status}`,
      user: req.user.id,
      board: board._id,
      contextType: 'board',
      metadata: { from: previousBoard.status, to: req.body.status }
    }));
  }

  if (req.body.priority && req.body.priority !== previousBoard.priority) {
    changes.push(`Priority changed to ${req.body.priority}`);
    activityTasks.push(Activity.create({
      type: 'project_priority_changed',
      description: `Priority changed to ${req.body.priority}`,
      user: req.user.id,
      board: board._id,
      contextType: 'board',
      metadata: { from: previousBoard.priority, to: req.body.priority }
    }));
  }

  if (Array.isArray(req.body.members)) {
    const prevMembers = (previousBoard.members || []).map(m => m.toString());
    const nextMembers = req.body.members.map(m => m.toString());
    const added = nextMembers.filter(id => !prevMembers.includes(id));
    const removed = prevMembers.filter(id => !nextMembers.includes(id));

    if (added.length > 0) {
      changes.push(`Members added (${added.length})`);
      activityTasks.push(Activity.create({
        type: 'project_member_added',
        description: `Added ${added.length} member(s)`,
        user: req.user.id,
        board: board._id,
        contextType: 'board',
        metadata: { added }
      }));
    }

    if (removed.length > 0) {
      changes.push(`Members removed (${removed.length})`);
      activityTasks.push(Activity.create({
        type: 'project_member_removed',
        description: `Removed ${removed.length} member(s)`,
        user: req.user.id,
        board: board._id,
        contextType: 'board',
        metadata: { removed }
      }));
    }
  }

  if (activityTasks.length > 0) {
    await Promise.all(activityTasks);
  }

  if (changes.length > 0) {
    await notificationService.notifyProjectUpdated(board, req.user.id, changes.slice(0, 3).join(', '));
    await slackHooks.onProjectUpdated(board, changes, req.user);
  }

  // Invalidate relevant caches
  invalidateCache(`/api/boards`);
  invalidateCache(`/api/boards/${req.params.id}`);
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${board.department}/members-with-assignments`);
  invalidateCache("/api/analytics/dashboard");

  res.status(200).json({
    success: true,
    data: board,
  });
});

// @desc    Get project activity timeline
// @route   GET /api/boards/:id/activity
// @access  Private
export const getProjectActivity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit || '50', 10);

  const activity = await Activity.find({ board: id })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.status(200).json({
    success: true,
    data: activity
  });
});

// @desc    Delete board
// @route   DELETE /api/boards/:id
// @access  Private
export const deleteBoard = asyncHandler(async (req, res, next) => {
  const board = await Board.findById(req.params.id);

  if (!board) {
    return next(new ErrorResponse("Board not found", 404));
  }

  // Check ownership
  if (board.owner.toString() !== req.user.id && req.user.role !== "admin") {
    return next(new ErrorResponse("Not authorized to delete this board", 403));
  }

  // Send notifications before deletion
  await notificationService.notifyTaskDeleted(board, req.user.id, true); // true for project deletion

  // Get all cards for this board (needed for cascade delete of card-related data)
  const cards = await Card.find({ board: board._id });
  const cardIds = cards.map(c => c._id);

  // Delete all reminders for this project
  await Reminder.deleteMany({ project: board._id });

  // Delete all labels for this board
  await Label.deleteMany({ board: board._id });

  // Delete all subtasks and their nano subtasks for this board
  const subtasks = await Subtask.find({ board: board._id });
  const subtaskIds = subtasks.map(s => s._id);
  await SubtaskNano.deleteMany({ subtask: { $in: subtaskIds } });
  await Subtask.deleteMany({ board: board._id });

  // Delete all comments for cards in this project
  await Comment.deleteMany({ card: { $in: cardIds } });

  // Delete all attachments for cards in this project
  await Attachment.deleteMany({ card: { $in: cardIds } });

  // Delete all recurring tasks for cards in this project
  await RecurringTask.deleteMany({ card: { $in: cardIds } });

  // Delete all lists and cards
  const lists = await List.find({ board: board._id });
  for (const list of lists) {
    await Card.deleteMany({ list: list._id });
  }
  await List.deleteMany({ board: board._id });
  await Activity.deleteMany({ board: board._id });

  // Remove board from department's projects array if department exists
  if (board.department) {
    await Department.findByIdAndUpdate(board.department, {
      $pull: { projects: board._id }
    });
  }

  await board.deleteOne();

  // Invalidate relevant caches
  invalidateCache(`/api/boards`);
  invalidateCache(`/api/boards/department/${board.department}`);
  invalidateCache("/api/departments");

  res.status(200).json({
    success: true,
    message: "Board deleted successfully",
  });
});

// =============================================
// COVER IMAGE ENDPOINTS
// =============================================

// @desc    Upload/Update project cover image
// @route   PUT /api/boards/:id/cover
// @access  Private (Admin/Manager only)
export const uploadCoverImage = asyncHandler(async (req, res, next) => {
  const board = await Board.findById(req.params.id);

  if (!board) {
    return next(new ErrorResponse("Project not found", 404));
  }

  // Role-based permission check - only Admin and Manager can change cover
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse("Only admins and managers can modify project covers", 403));
  }

  // Check if file was uploaded
  if (!req.file) {
    return next(new ErrorResponse("Please upload an image file", 400));
  }

  // Validate the file
  const validation = validateCoverImage({
    mimetype: req.file.mimetype,
    size: req.file.size,
    buffer: req.file.buffer
  });

  if (!validation.valid) {
    return next(new ErrorResponse(validation.error, 400));
  }

  try {
    // Upload to Cloudinary
    const uploadResult = await uploadProjectCover(req.file.buffer, {
      projectId: board._id.toString(),
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      uploadedBy: req.user.id
    });

    // If there's an existing cover, move it to history
    if (board.coverImage && board.coverImage.publicId) {
      // Limit history to 3 items
      const newHistory = [
        {
          url: board.coverImage.url,
          publicId: board.coverImage.publicId,
          thumbnailUrl: board.coverImage.thumbnailUrl,
          dominantColor: board.coverImage.dominantColor,
          archivedAt: new Date()
        },
        ...((board.coverImageHistory || []).slice(0, 2))
      ];

      board.coverImageHistory = newHistory;
    }

    // Set new cover image
    board.coverImage = {
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      thumbnailUrl: uploadResult.thumbnailUrl,
      dominantColor: uploadResult.dominantColor,
      width: uploadResult.width,
      height: uploadResult.height,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
      uploadedAt: uploadResult.uploadedAt,
      uploadedBy: req.user.id
    };

    await board.save({ validateModifiedOnly: true });

    // Invalidate caches
    invalidateCache(`/api/boards`);
    invalidateCache(`/api/boards/${req.params.id}`);
    invalidateCache(`/api/boards/department/${board.department}`);
    invalidateCache("/api/departments");

    res.status(200).json({
      success: true,
      data: {
        coverImage: board.coverImage,
        coverImageHistory: board.coverImageHistory
      }
    });
  } catch (error) {
    console.error('Cover image upload error:', error);
    return next(new ErrorResponse(`Failed to upload cover image: ${error.message}`, 500));
  }
});

// @desc    Remove project cover image
// @route   DELETE /api/boards/:id/cover
// @access  Private (Admin/Manager only)
export const removeCoverImage = asyncHandler(async (req, res, next) => {
  const board = await Board.findById(req.params.id);

  if (!board) {
    return next(new ErrorResponse("Project not found", 404));
  }

  // Role-based permission check
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse("Only admins and managers can modify project covers", 403));
  }

  if (!board.coverImage || !board.coverImage.publicId) {
    return next(new ErrorResponse("No cover image to remove", 400));
  }

  const previousCover = { ...board.coverImage };

  try {
    // Delete from Cloudinary
    await deleteProjectCover(board.coverImage.publicId);

    // Move to history before clearing (for undo functionality)
    const newHistory = [
      {
        url: previousCover.url,
        publicId: previousCover.publicId,
        thumbnailUrl: previousCover.thumbnailUrl,
        dominantColor: previousCover.dominantColor,
        archivedAt: new Date()
      },
      ...((board.coverImageHistory || []).slice(0, 2))
    ];

    board.coverImageHistory = newHistory;
    board.coverImage = undefined;

    await board.save({ validateModifiedOnly: true });

    // Invalidate caches
    invalidateCache(`/api/boards`);
    invalidateCache(`/api/boards/${req.params.id}`);
    invalidateCache(`/api/boards/department/${board.department}`);
    invalidateCache("/api/departments");

    res.status(200).json({
      success: true,
      message: "Cover image removed successfully",
      data: {
        previousCover,
        coverImageHistory: board.coverImageHistory
      }
    });
  } catch (error) {
    console.error('Cover image removal error:', error);
    return next(new ErrorResponse(`Failed to remove cover image: ${error.message}`, 500));
  }
});

// @desc    Restore cover image from history
// @route   POST /api/boards/:id/cover/restore/:versionIndex
// @access  Private (Admin/Manager only)
export const restoreCoverImage = asyncHandler(async (req, res, next) => {
  const { id, versionIndex } = req.params;
  const index = parseInt(versionIndex, 10);

  const board = await Board.findById(id);

  if (!board) {
    return next(new ErrorResponse("Project not found", 404));
  }

  // Role-based permission check
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse("Only admins and managers can modify project covers", 403));
  }

  if (!board.coverImageHistory || index < 0 || index >= board.coverImageHistory.length) {
    return next(new ErrorResponse("Invalid version index", 400));
  }

  const historyItem = board.coverImageHistory[index];

  // If there's a current cover, move it to history
  if (board.coverImage && board.coverImage.publicId) {
    // Remove the restored item and add current to beginning
    const newHistory = [
      {
        url: board.coverImage.url,
        publicId: board.coverImage.publicId,
        thumbnailUrl: board.coverImage.thumbnailUrl,
        dominantColor: board.coverImage.dominantColor,
        archivedAt: new Date()
      },
      ...board.coverImageHistory.filter((_, i) => i !== index).slice(0, 2)
    ];
    board.coverImageHistory = newHistory;
  } else {
    // Just remove the restored item from history
    board.coverImageHistory = board.coverImageHistory.filter((_, i) => i !== index);
  }

  // Set restored cover as current
  board.coverImage = {
    url: historyItem.url,
    publicId: historyItem.publicId,
    thumbnailUrl: historyItem.thumbnailUrl,
    dominantColor: historyItem.dominantColor,
    uploadedAt: new Date(),
    uploadedBy: req.user.id
  };

  await board.save({ validateModifiedOnly: true });

  // Invalidate caches
  invalidateCache(`/api/boards`);
  invalidateCache(`/api/boards/${id}`);
  invalidateCache(`/api/boards/department/${board.department}`);
  invalidateCache("/api/departments");

  res.status(200).json({
    success: true,
    message: "Cover image restored successfully",
    data: {
      coverImage: board.coverImage,
      coverImageHistory: board.coverImageHistory
    }
  });
});

import Board from "../models/Board.js";
import List from "../models/List.js";
import Card from "../models/Card.js";
import Attachment from "../models/Attachment.js";
import Label from "../models/Label.js";
import Activity from "../models/Activity.js";
import Department from "../models/Department.js";
import Notification from "../models/Notification.js";
import RecurringTask from "../models/RecurringTask.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";
import { emitNotification } from "../server.js";
import notificationService from "../utils/notificationService.js";
import { 
  notifyProjectCreatedInBackground, 
  sendProjectEmailsInBackground, 
  logProjectActivityInBackground,
  invalidateCacheInBackground 
} from "../utils/backgroundTasks.js";

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
  const [board, lists] = await Promise.all([
    Board.findById(projectId)
      .populate('owner', 'name email avatar role')
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('members', 'name email avatar role')
      .lean(),
    List.find({ board: projectId, isArchived: false })
      .sort('position')
      .lean()
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

  // Fetch all cards for all lists in one query
  const listIds = lists.map(l => l._id);
  const cards = await Card.find({ list: { $in: listIds } })
    .populate('assignees', 'name email avatar')
    .populate('members', 'name email avatar')
    .populate('coverImage', 'url secureUrl thumbnailUrl fileName fileType isCover')
    .sort({ list: 1, position: 1 })
    .lean();

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

  // Calculate progress based on cards
  const cards = await Card.find({ board: board._id }).select('status');
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

  board = await Board.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate("owner", "name email avatar")
    .populate("members", "name email avatar");

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

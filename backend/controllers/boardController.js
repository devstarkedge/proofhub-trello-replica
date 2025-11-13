import Board from "../models/Board.js";
import List from "../models/List.js";
import Card from "../models/Card.js";
import Activity from "../models/Activity.js";
import Department from "../models/Department.js";
import Notification from "../models/Notification.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";
import { emitNotification } from "../server.js";

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
    .sort("-createdAt");

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
    .sort("-createdAt");

  res.status(200).json({
    success: true,
    count: boards.length,
    data: boards,
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
    .populate("members", "name email avatar role");

  if (!board) {
    return next(new ErrorResponse("Project not found", 404));
  }

  // Verify the project belongs to the specified department
  if (board.department._id.toString() !== departmentId) {
    return next(new ErrorResponse("This project does not belong to the specified department", 403));
  }

  // Check access
  const hasAccess =
    board.owner._id.toString() === req.user.id ||
    board.members.some((m) => m._id.toString() === req.user.id) ||
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
  const hasAccess =
    board.owner._id.toString() === req.user.id ||
    board.members.some((m) => m._id.toString() === req.user.id) ||
    board.visibility === "public";

  if (!hasAccess) {
    return next(new ErrorResponse("Not authorized to access this board", 403));
  }

  res.status(200).json({
    success: true,
    data: board,
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

  // Create default lists
  const defaultLists = ["To Do", "In Progress", "Review", "Done"];
  for (let i = 0; i < defaultLists.length; i++) {
    await List.create({
      title: defaultLists[i],
      board: board._id,
      position: i,
    });
  }

  // Log activity
  await Activity.create({
    type: "board_created",
    description: `Created board "${name}"`,
    user: req.user.id,
    board: board._id,
  });

  // Send notifications to assigned members and department managers
  const notifications = [];

  // Notify assigned members
  if (board.members && board.members.length > 0) {
    board.members.forEach(memberId => {
      if (memberId.toString() !== req.user.id) { // Don't notify the creator
        notifications.push({
          type: 'project_created',
          title: 'New Project Created',
          message: `You have been assigned to the project "${name}"`,
          user: memberId,
          sender: req.user.id,
          relatedBoard: board._id
        });
      }
    });
  }

  // Notify department managers
  const deptManagers = await Department.findById(board.department).populate('managers', '_id');
  if (deptManagers && deptManagers.managers && deptManagers.managers.length > 0) {
    deptManagers.managers.forEach(manager => {
      if (manager._id.toString() !== req.user.id) { // Don't notify the creator if they're a manager
        notifications.push({
          type: 'project_created',
          title: 'New Project Created',
          message: `A new project "${name}" has been created in your department`,
          user: manager._id,
          sender: req.user.id,
          relatedBoard: board._id
        });
      }
    });
  }

  // Create and emit notifications
  if (notifications.length > 0) {
    const createdNotifications = await Notification.insertMany(notifications);
    createdNotifications.forEach(notification => {
      emitNotification(notification.user.toString(), notification);
    });
  }

  // Invalidate relevant caches
  invalidateCache(`/api/boards`);
  invalidateCache(`/api/boards/department/${board.department}`);
  invalidateCache("/api/departments");
  invalidateCache("/api/analytics/dashboard");

  const populatedBoard = await Board.findById(board._id)
    .populate("owner", "name email avatar")
    .populate("team", "name")
    .populate("department", "name")
    .populate("members", "name email avatar");

  res.status(201).json({
    success: true,
    data: populatedBoard,
  });
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
  if (board.owner.toString() !== req.user.id && req.user.role !== "admin" && req.user.role !== "manager") {
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
  const notifications = [];

  // Notify assigned members
  if (board.members && board.members.length > 0) {
    board.members.forEach(memberId => {
      if (memberId.toString() !== req.user.id) { // Don't notify the deleter
        notifications.push({
          type: 'project_deleted',
          title: 'Project Deleted',
          message: `The project "${board.name}" has been deleted`,
          user: memberId,
          sender: req.user.id,
          relatedBoard: board._id
        });
      }
    });
  }

  // Notify department managers
  const deptManagersDel = await Department.findById(board.department).populate('managers', '_id');
  if (deptManagersDel && deptManagersDel.managers && deptManagersDel.managers.length > 0) {
    deptManagersDel.managers.forEach(manager => {
      if (manager._id.toString() !== req.user.id) { // Don't notify the deleter if they're a manager
        notifications.push({
          type: 'project_deleted',
          title: 'Project Deleted',
          message: `The project "${board.name}" has been deleted from your department`,
          user: manager._id,
          sender: req.user.id,
          relatedBoard: board._id
        });
      }
    });
  }

  // Create and emit notifications
  if (notifications.length > 0) {
    const createdNotifications = await Notification.insertMany(notifications);
    createdNotifications.forEach(notification => {
      emitNotification(notification.user.toString(), notification);
    });
  }

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

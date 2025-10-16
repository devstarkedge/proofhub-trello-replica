import Board from "../models/Board.js";
import List from "../models/List.js";
import Card from "../models/Card.js";
import Activity from "../models/Activity.js";
import Department from "../models/Department.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";

// @desc    Get all boards for user
// @route   GET /api/boards
// @access  Private
export const getBoards = asyncHandler(async (req, res, next) => {
  let query = {
    $or: [{ owner: req.user.id }, { members: req.user.id }],
  };

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
  } = req.body;

  // Managers can only create boards for their department
  if (
    req.user.role === "manager" &&
    (!department || department.toString() !== req.user.department?.toString())
  ) {
    return next(
      new ErrorResponse(
        "Managers can only create boards for their department",
        403
      )
    );
  }

  // Ensure team is provided or use user's team
  const boardTeam = team || req.user.team;
  if (!boardTeam) {
    return next(
      new ErrorResponse(
        "Team is required to create a board",
        400
      )
    );
  }

  const board = await Board.create({
    name,
    description,
    team: boardTeam,
    department: department || req.user.department,
    owner: req.user.id,
    members: members || [req.user.id],
    visibility: visibility || "private",
    background: background || "#6366f1",
  });

  // Add board to department's projects array if department exists
  if (board.department) {
    await Department.findByIdAndUpdate(board.department, {
      $push: { projects: board._id }
    });
  }

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

  const populatedBoard = await Board.findById(board._id)
    .populate("owner", "name email avatar")
    .populate("team", "name")
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

  // Check ownership
  if (board.owner.toString() !== req.user.id && req.user.role !== "admin") {
    return next(new ErrorResponse("Not authorized to update this board", 403));
  }

  board = await Board.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate("owner", "name email avatar")
    .populate("members", "name email avatar");

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

  // Delete all lists and cards
  const lists = await List.find({ board: board._id });
  for (const list of lists) {
    await Card.deleteMany({ list: list._id });
  }
  await List.deleteMany({ board: board._id });
  await Activity.deleteMany({ board: board._id });

  await board.deleteOne();

  res.status(200).json({
    success: true,
    message: "Board deleted successfully",
  });
});

import Card from "../models/Card.js";
import Board from "../models/Board.js";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";

// @desc    Global search
// @route   GET /api/search
// @access  Private
export const globalSearch = asyncHandler(async (req, res, next) => {
  const { q, type } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: "Please provide a search query",
    });
  }

  const searchRegex = new RegExp(q, "i");
  let results = {};

  // Search cards
  if (!type || type === "cards") {
    const cards = await Card.find({
      $or: [
        { title: searchRegex },
        { description: searchRegex },
        { labels: searchRegex },
      ],
    })
      .populate("assignees", "name email avatar")
      .populate("list", "title")
      .populate("board", "name")
      .limit(20);

    results.cards = cards;
  }

  // Search boards
  if (!type || type === "boards") {
    const boards = await Board.find({
      $or: [{ name: searchRegex }, { description: searchRegex }],
      $or: [
        { owner: req.user.id },
        { members: req.user.id },
        { visibility: "public" },
      ],
    })
      .populate("owner", "name email avatar")
      .limit(20);

    results.boards = boards;
  }

  // Search users
  if (!type || type === "users") {
    const users = await User.find({
      $or: [{ name: searchRegex }, { email: searchRegex }],
      isActive: true,
    })
      .select("name email avatar role department team")
      .populate("department", "name")
      .populate("team", "name")
      .limit(20);

    results.users = users;
  }

  res.status(200).json({
    success: true,
    query: q,
    data: results,
  });
});

// @desc    Search cards with filters
// @route   GET /api/search/cards
// @access  Private
export const searchCards = asyncHandler(async (req, res, next) => {
  const {
    q,
    board,
    assignee,
    priority,
    status,
    labels,
    dueDateFrom,
    dueDateTo,
  } = req.query;

  let query = {};

  // Text search
  if (q) {
    const searchRegex = new RegExp(q, "i");
    query.$or = [{ title: searchRegex }, { description: searchRegex }];
  }

  // Filters
  if (board) query.board = board;
  if (assignee) query.assignees = { $in: [assignee] };
  if (priority) query.priority = priority;
  if (status) query.status = status;
  if (labels) query.labels = { $in: Array.isArray(labels) ? labels : [labels] };

  if (dueDateFrom || dueDateTo) {
    query.dueDate = {};
    if (dueDateFrom) query.dueDate.$gte = new Date(dueDateFrom);
    if (dueDateTo) query.dueDate.$lte = new Date(dueDateTo);
  }

  const cards = await Card.find(query)
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("list", "title")
    .populate("board", "name")
    .sort("-createdAt")
    .limit(100);

  res.status(200).json({
    success: true,
    count: cards.length,
    data: cards,
  });
});

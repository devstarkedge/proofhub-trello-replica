import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { literalSearch } from '../utils/literalSearch.js';
import Card from "../models/Card.js";
import Board from "../models/Board.js";
import User from "../models/User.js";
import "../models/Department.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";

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

  const searchRegex = literalSearch(q);
  const membershipFilter = { workspace: req.workspaceId, status: 'active' };
  if (req.query.departmentId && req.query.departmentId !== 'all') membershipFilter.department = req.query.departmentId;
  const memberIds = await WorkspaceMembership.distinct('user', membershipFilter);
  let results = {};

  // Resolve boards accessible to current user
  const boardAccessFilter = req.user.role === 'admin'
    ? {}
    : {
        $or: [
          { owner: req.user.id },
          { members: req.user.id },
          { visibility: "public" },
          ...(req.user.allowedProjects?.length ? [{ _id: { $in: req.user.allowedProjects } }] : [])
        ]
      };

  const accessibleBoards = await Board.find(boardAccessFilter).select('_id').lean();
  const accessibleBoardIds = accessibleBoards.map(b => b._id);

  // Search cards (filtered to accessible boards only)
  if (!type || type === "cards") {
    const cardQuery = {
      $and: [
        {
          $or: [
            { title: searchRegex },
            { description: searchRegex },
          ]
        },
        req.user.role === 'admin' ? {} : { board: { $in: accessibleBoardIds } }
      ]
    };

    const cards = await Card.find(cardQuery)
      .populate("assignees", "name email avatar")
      .populate("list", "title")
      .populate("board", "name")
      .limit(20);

    results.cards = cards;
  }

  // Search boards (fixing duplicate $or key bug using $and)
  if (!type || type === "boards") {
    const boardQuery = {
      $and: [
        { $or: [{ name: searchRegex }, { description: searchRegex }] },
        boardAccessFilter
      ]
    };

    const boards = await Board.find(boardQuery)
      .populate("owner", "name email avatar")
      .limit(20);

    results.boards = boards;
  }

  // Search users
  if (!type || type === "users") {
    const users = await User.find({
      _id: { $in: memberIds },
      $or: [{ name: searchRegex }, { email: searchRegex }],
      isActive: true,
    })
      .select("name email avatar")
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
    const searchRegex = literalSearch(q);
  const membershipFilter = { workspace: req.workspaceId, status: 'active' };
  if (req.query.departmentId && req.query.departmentId !== 'all') membershipFilter.department = req.query.departmentId;
  const memberIds = await WorkspaceMembership.distinct('user', membershipFilter);
    query.$or = [{ title: searchRegex }, { description: searchRegex }];
  }

  // Access control: Ensure user can only search in accessible boards
  const accessibleBoards = await Board.find(
    req.user.role === 'admin'
      ? {}
      : {
          $or: [
            { owner: req.user.id },
            { members: req.user.id },
            { visibility: "public" },
            ...(req.user.allowedProjects?.length ? [{ _id: { $in: req.user.allowedProjects } }] : [])
          ]
        }
  ).select('_id').lean();
  const accessibleBoardIds = accessibleBoards.map(b => b._id.toString());

  if (board) {
    if (req.user.role !== 'admin' && !accessibleBoardIds.includes(board.toString())) {
      return next(new ErrorResponse("Not authorized to search in this project", 403));
    }
    query.board = board;
  } else if (req.user.role !== 'admin') {
    query.board = { $in: accessibleBoardIds };
  }
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

// @desc    Get search suggestions for smart search bar
// @route   GET /api/search/suggestions
// @access  Private
export const getSuggestions = asyncHandler(async (req, res, next) => {
  const { field, q, departmentId } = req.query;

  if (!q || q.trim().length < 1) {
    return res.status(200).json({ success: true, data: [] });
  }

  const query = q.trim();
  const searchRegex = literalSearch(query);
  const membershipFilter = { workspace: req.workspaceId, status: 'active' };
  if (req.query.departmentId && req.query.departmentId !== 'all') membershipFilter.department = req.query.departmentId;
  const memberIds = await WorkspaceMembership.distinct('user', membershipFilter);
  const limit = 8;

  let suggestions = [];

  // Build department filter for board lookup
  const getDepartmentBoardIds = async () => {
    if (!departmentId || departmentId === "all") return null;
    const boards = await Board.find({ department: departmentId }).select("_id");
    return boards.map((b) => b._id);
  };

  switch (field) {
    case "task": {
      const boardFilter = await getDepartmentBoardIds();
      const matchStage = { isArchived: { $ne: true } };
      if (boardFilter) matchStage.board = { $in: boardFilter };

      const cards = await Card.find({
        ...matchStage,
        title: searchRegex,
      })
        .select("title")
        .limit(limit)
        .lean();

      suggestions = cards.map((c) => ({
        value: c.title,
        label: c.title,
        type: "task",
      }));
      break;
    }

    case "project": {
      const boardMatch = { name: searchRegex };
      if (departmentId && departmentId !== "all") {
        boardMatch.department = departmentId;
      }

      const boards = await Board.find(boardMatch)
        .select("name")
        .limit(limit)
        .lean();

      suggestions = boards.map((b) => ({
        value: b.name,
        label: b.name,
        type: "project",
      }));
      break;
    }

    case "assignee": {
      let userFilter = { _id: { $in: memberIds }, isActive: true, name: searchRegex };

      const users = await User.find(userFilter)
        .select("name email avatar")
        .limit(limit)
        .lean();

      suggestions = users.map((u) => ({
        value: u.name,
        label: u.name,
        id: u._id,
        avatar: u.avatar,
        type: "assignee",
      }));
      break;
    }

    case "priority": {
      const priorities = ["low", "medium", "high", "critical"];
      suggestions = priorities
        .filter((p) => p.includes(query.toLowerCase()))
        .map((p) => ({
          value: p,
          label: p.charAt(0).toUpperCase() + p.slice(1),
          type: "priority",
        }));
      break;
    }

    case "status": {
      const statuses = ["to do", "in progress", "review", "done", "blocked"];
      suggestions = statuses
        .filter((s) => s.includes(query.toLowerCase()))
        .map((s) => ({
          value: s,
          label: s
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          type: "status",
        }));
      break;
    }

    case "all":
    default: {
      const boardFilter = await getDepartmentBoardIds();
      const cardMatch = { isArchived: { $ne: true } };
      if (boardFilter) cardMatch.board = { $in: boardFilter };

      const [cards, boards, users] = await Promise.all([
        Card.find({ ...cardMatch, title: searchRegex })
          .select("title")
          .limit(4)
          .lean(),
        Board.find(
          departmentId && departmentId !== "all"
            ? { name: searchRegex, department: departmentId }
            : { name: searchRegex }
        )
          .select("name")
          .limit(3)
          .lean(),
        User.find({
      _id: { $in: memberIds },
          isActive: true,
          name: searchRegex,
        })
          .select("name avatar")
          .limit(3)
          .lean(),
      ]);

      suggestions = [
        ...cards.map((c) => ({
          value: c.title,
          label: c.title,
          type: "task",
        })),
        ...boards.map((b) => ({
          value: b.name,
          label: b.name,
          type: "project",
        })),
        ...users.map((u) => ({
          value: u.name,
          label: u.name,
          avatar: u.avatar,
          type: "assignee",
        })),
      ];
      break;
    }
  }

  res.status(200).json({
    success: true,
    data: suggestions,
  });
});

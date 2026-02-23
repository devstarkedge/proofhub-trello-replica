import Card from "../models/Card.js";
import User from "../models/User.js";
import Label from "../models/Label.js";
import List from "../models/List.js";
import Board from "../models/Board.js";
import Department from "../models/Department.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import RecurringTask from "../models/RecurringTask.js";
import VersionHistory from "../models/VersionHistory.js";
import Subtask from "../models/Subtask.js";
import SubtaskNano from "../models/SubtaskNano.js";
import Comment from "../models/Comment.js";
import Attachment from "../models/Attachment.js";
import mongoose from "mongoose";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { emitToBoard, emitNotification, emitToDepartment } from "../realtime/index.js";
import notificationService from "../utils/notificationService.js";
import { slackHooks } from "../utils/slackHooks.js";
import { chatHooks } from "../utils/chatHooks.js";
import { processTimeEntriesWithOwnership } from "../utils/timeEntryUtils.js";
import { emitFinanceDataRefresh } from "../realtime/index.js";

// In-memory store for undo tokens (move operations) — entries auto-expire after 10 seconds
const undoTokenStore = new Map();

// @desc    Get all cards for a list
// @route   GET /api/cards/list/:listId
// @access  Private
export const getCards = asyncHandler(async (req, res, next) => {
  const { listId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Use aggregation pipeline for single query with recurrence status
  const pipeline = [
    { $match: { list: new mongoose.Types.ObjectId(listId), isArchived: false } },
    { $sort: { position: 1 } },
    { $skip: skip },
    { $limit: limitNum },
    // Lookup assignees
    {
      $lookup: {
        from: 'users',
        localField: 'assignees',
        foreignField: '_id',
        as: 'assignees',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup members
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        as: 'members',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup labels - handle both ObjectId and string formats
    {
      $lookup: {
        from: 'labels',
        let: { labelIds: { $ifNull: ['$labels', []] } },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  { $toString: '$_id' },
                  {
                    $map: {
                      input: '$$labelIds',
                      as: 'lid',
                      in: { $toString: '$$lid' }
                    }
                  }
                ]
              }
            }
          },
          { $project: { name: 1, color: 1 } }
        ],
        as: 'labels'
      }
    },
    // Lookup createdBy
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdByArr',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup comments
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'card',
        as: 'comments',
        pipeline: [{ $project: { text: 1, htmlContent: 1, user: 1, createdAt: 1 } }]
      }
    },
    // Lookup coverImage from attachments collection
    {
      $lookup: {
        from: 'attachments',
        localField: 'coverImage',
        foreignField: '_id',
        as: 'coverImageArr',
        pipeline: [{ $project: { url: 1, secureUrl: 1, thumbnailUrl: 1, fileName: 1, fileType: 1, isCover: 1 } }]
      }
    },
    // Lookup recurring tasks in same pipeline
    {
      $lookup: {
        from: 'recurringtasks',
        let: { cardId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$card', '$$cardId'] }, { $eq: ['$isActive', true] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } }
        ],
        as: 'recurrence'
      }
    },
    // Add computed fields
    {
      $addFields: {
        createdBy: { $arrayElemAt: ['$createdByArr', 0] },
        coverImage: { $arrayElemAt: ['$coverImageArr', 0] },
        hasRecurrence: { $gt: [{ $size: '$recurrence' }, 0] }
      }
    },
    // Clean up temporary fields
    { $project: { createdByArr: 0, coverImageArr: 0, recurrence: 0 } }
  ];

  const [cards, countResult] = await Promise.all([
    Card.aggregate(pipeline),
    Card.countDocuments({ list: listId })
  ]);

  res.status(200).json({
    success: true,
    count: countResult,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(countResult / limitNum),
      hasNext: pageNum * limitNum < countResult,
      hasPrev: pageNum > 1
    },
    data: cards,
  });
});

// @desc    Get all cards for a board
// @route   GET /api/cards/board/:boardId
// @access  Private
export const getCardsByBoard = asyncHandler(async (req, res, next) => {
  const { boardId } = req.params;
  const { page = 1, limit = 100 } = req.query;

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Use aggregation pipeline for single query with recurrence status - EXCLUDE ARCHIVED CARDS
  const pipeline = [
    { $match: { board: new mongoose.Types.ObjectId(boardId), isArchived: false } },
    { $sort: { position: 1 } },
    { $skip: skip },
    { $limit: limitNum },
    // Lookup assignees
    {
      $lookup: {
        from: 'users',
        localField: 'assignees',
        foreignField: '_id',
        as: 'assignees',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup members
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        as: 'members',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup labels - handle both ObjectId and string formats
    {
      $lookup: {
        from: 'labels',
        let: { labelIds: { $ifNull: ['$labels', []] } },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  { $toString: '$_id' },
                  {
                    $map: {
                      input: '$$labelIds',
                      as: 'lid',
                      in: { $toString: '$$lid' }
                    }
                  }
                ]
              }
            }
          },
          { $project: { name: 1, color: 1 } }
        ],
        as: 'labels'
      }
    },
    // Lookup createdBy
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdByArr',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup list
    {
      $lookup: {
        from: 'lists',
        localField: 'list',
        foreignField: '_id',
        as: 'listArr',
        pipeline: [{ $project: { title: 1 } }]
      }
    },
    // Lookup comments
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'card',
        as: 'comments',
        pipeline: [{ $project: { text: 1, htmlContent: 1, user: 1, createdAt: 1 } }]
      }
    },
    // Lookup recurring tasks in same pipeline
    {
      $lookup: {
        from: 'recurringtasks',
        let: { cardId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$card', '$$cardId'] }, { $eq: ['$isActive', true] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } }
        ],
        as: 'recurrence'
      }
    },
    // Add computed fields
    {
      $addFields: {
        createdBy: { $arrayElemAt: ['$createdByArr', 0] },
        list: { $arrayElemAt: ['$listArr', 0] },
        hasRecurrence: { $gt: [{ $size: '$recurrence' }, 0] }
      }
    },
    // Clean up temporary fields
    { $project: { createdByArr: 0, listArr: 0, recurrence: 0 } }
  ];

  const [cards, countResult] = await Promise.all([
    Card.aggregate(pipeline),
    Card.countDocuments({ board: boardId, isArchived: false })
  ]);

  res.status(200).json({
    success: true,
    count: countResult,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(countResult / limitNum),
      hasNext: pageNum * limitNum < countResult,
      hasPrev: pageNum > 1
    },
    data: cards,
  });
});

// @desc    Get all cards for a department
// @route   GET /api/cards/department/:departmentId
// @access  Private
export const getCardsByDepartment = asyncHandler(async (req, res, next) => {
  const { departmentId } = req.params;
  const { page = 1, limit = 200 } = req.query;
  const user = req.user;

  let departmentMatch = {};
  if (departmentId === 'all') {
    // Get all departments user has access to
    const Department = mongoose.model('Department');
    let departmentQuery = {};
    if (user.role === 'manager') {
      departmentQuery._id = user.department;
    } else if (user.role !== 'admin') {
      departmentQuery.members = user._id;
    }
    const accessibleDepartments = await Department.find(departmentQuery);
    const departmentIds = accessibleDepartments.map(d => d._id);
    departmentMatch = { 'boardInfo.department': { $in: departmentIds } };
  } else {
    departmentMatch = { 'boardInfo.department': new mongoose.Types.ObjectId(departmentId) };
  }

  // Use aggregation pipeline for better performance
  const pipeline = [
    {
      $lookup: {
        from: 'boards',
        localField: 'board',
        foreignField: '_id',
        as: 'boardInfo'
      }
    },
    {
      $match: {
        ...departmentMatch,
        isArchived: false
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'assignees',
        foreignField: '_id',
        as: 'assignees'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        as: 'members'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy'
      }
    },
    {
      $lookup: {
        from: 'lists',
        localField: 'list',
        foreignField: '_id',
        as: 'list'
      }
    },
    {
      $lookup: {
        from: 'boards',
        localField: 'board',
        foreignField: '_id',
        as: 'board'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'loggedTime.user',
        foreignField: '_id',
        as: 'loggedTimeUsers'
      }
    },
    {
      $addFields: {
        loggedTime: {
          $map: {
            input: '$loggedTime',
            as: 'log',
            in: {
              hours: '$$log.hours',
              minutes: '$$log.minutes',
              description: '$$log.description',
              date: '$$log.date',
              user: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$loggedTimeUsers',
                      cond: { $eq: ['$$this._id', '$$log.user'] }
                    }
                  },
                  0
                ]
              }
            }
          }
        }
      }
    },
    {
      $unwind: {
        path: '$list',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $unwind: {
        path: '$board',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        title: 1,
        description: 1,
        status: 1,
        priority: 1,
        dueDate: 1,
        position: 1,
        assignees: { name: 1, email: 1, avatar: 1 },
        members: { name: 1, email: 1, avatar: 1 },
        createdBy: { name: 1, email: 1, avatar: 1 },
        list: { title: 1 },
        board: { _id: 1, name: 1, department: 1 },
        loggedTime: 1,
        totalLoggedTime: {
          $reduce: {
            input: '$loggedTime',
            initialValue: { hours: 0, minutes: 0 },
            in: {
              hours: { $add: ['$$value.hours', '$$this.hours'] },
              minutes: { $add: ['$$value.minutes', '$$this.minutes'] }
            }
          }
        },
        updatedAt: 1
      }
    },
    {
      $sort: { updatedAt: -1 }
    },
    {
      $skip: (parseInt(page, 10) - 1) * parseInt(limit, 10)
    },
    {
      $limit: parseInt(limit, 10)
    }
  ];

  const cards = await Card.aggregate(pipeline);
  const totalCount = await Card.aggregate([
    {
      $lookup: {
        from: 'boards',
        localField: 'board',
        foreignField: '_id',
        as: 'boardInfo'
      }
    },
    {
      $match: departmentMatch
    },
    {
      $count: "total"
    }
  ]);

  const total = totalCount.length > 0 ? totalCount[0].total : 0;

  res.status(200).json({
    success: true,
    count: total,
    pagination: {
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      hasNext: parseInt(page, 10) * parseInt(limit, 10) < total,
      hasPrev: parseInt(page, 10) > 1
    },
    data: cards,
  });
});

// @desc    Get single card
// @route   GET /api/cards/:id
// @access  Private
export const getCard = asyncHandler(async (req, res, next) => {
  // Use aggregation to get card with recurrence status in single query
  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
    // Lookup assignees
    {
      $lookup: {
        from: 'users',
        localField: 'assignees',
        foreignField: '_id',
        as: 'assignees',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup members
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        as: 'members',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup createdBy
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdByArr',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup list
    {
      $lookup: {
        from: 'lists',
        localField: 'list',
        foreignField: '_id',
        as: 'listArr',
        pipeline: [{ $project: { title: 1 } }]
      }
    },
    // Lookup board
    {
      $lookup: {
        from: 'boards',
        localField: 'board',
        foreignField: '_id',
        as: 'boardArr',
        pipeline: [{ $project: { name: 1 } }]
      }
    },
    // Lookup labels - handle both ObjectId and string formats
    {
      $lookup: {
        from: 'labels',
        let: { labelIds: { $ifNull: ['$labels', []] } },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  { $toString: '$_id' },
                  {
                    $map: {
                      input: '$$labelIds',
                      as: 'lid',
                      in: { $toString: '$$lid' }
                    }
                  }
                ]
              }
            }
          },
          { $project: { name: 1, color: 1 } }
        ],
        as: 'labels'
      }
    },
    // Lookup recurring tasks in same pipeline
    {
      $lookup: {
        from: 'recurringtasks',
        let: { cardId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$card', '$$cardId'] }, { $eq: ['$isActive', true] }] } } },
          { $limit: 1 },
          { $project: { _id: 1 } }
        ],
        as: 'recurrence'
      }
    },
    // Lookup coverImage from attachments collection
    {
      $lookup: {
        from: 'attachments',
        localField: 'coverImage',
        foreignField: '_id',
        as: 'coverImageArr',
        pipeline: [{ $project: { url: 1, secureUrl: 1, thumbnailUrl: 1, fileName: 1, fileType: 1 } }]
      }
    },
    // Lookup users for time tracking entries
    {
      $lookup: {
        from: 'users',
        localField: 'estimationTime.user',
        foreignField: '_id',
        as: 'estimationTimeUsers',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'loggedTime.user',
        foreignField: '_id',
        as: 'loggedTimeUsers',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'billedTime.user',
        foreignField: '_id',
        as: 'billedTimeUsers',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Add computed fields
    {
      $addFields: {
        createdBy: { $arrayElemAt: ['$createdByArr', 0] },
        list: { $arrayElemAt: ['$listArr', 0] },
        board: { $arrayElemAt: ['$boardArr', 0] },
        hasRecurrence: { $gt: [{ $size: '$recurrence' }, 0] },
        coverImage: { $arrayElemAt: ['$coverImageArr', 0] },
        // Populate user in estimationTime entries
        estimationTime: {
          $map: {
            input: { $ifNull: ['$estimationTime', []] },
            as: 'entry',
            in: {
              $mergeObjects: [
                '$$entry',
                {
                  user: {
                    $arrayElemAt: [
                      { $filter: { input: '$estimationTimeUsers', cond: { $eq: ['$$this._id', '$$entry.user'] } } },
                      0
                    ]
                  }
                }
              ]
            }
          }
        },
        // Populate user in loggedTime entries
        loggedTime: {
          $map: {
            input: { $ifNull: ['$loggedTime', []] },
            as: 'entry',
            in: {
              $mergeObjects: [
                '$$entry',
                {
                  user: {
                    $arrayElemAt: [
                      { $filter: { input: '$loggedTimeUsers', cond: { $eq: ['$$this._id', '$$entry.user'] } } },
                      0
                    ]
                  }
                }
              ]
            }
          }
        },
        // Populate user in billedTime entries
        billedTime: {
          $map: {
            input: { $ifNull: ['$billedTime', []] },
            as: 'entry',
            in: {
              $mergeObjects: [
                '$$entry',
                {
                  user: {
                    $arrayElemAt: [
                      { $filter: { input: '$billedTimeUsers', cond: { $eq: ['$$this._id', '$$entry.user'] } } },
                      0
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    },
    // Clean up temporary fields
    { $project: { createdByArr: 0, listArr: 0, boardArr: 0, recurrence: 0, coverImageArr: 0, estimationTimeUsers: 0, loggedTimeUsers: 0, billedTimeUsers: 0 } }
  ];

  const results = await Card.aggregate(pipeline);
  
  if (!results || results.length === 0) {
    return next(new ErrorResponse("Card not found", 404));
  }

  res.status(200).json({
    success: true,
    data: results[0],
  });
});

// @desc    Create card
// @route   POST /api/cards
// @access  Private
export const createCard = asyncHandler(async (req, res, next) => {
  const {
    title,
    description,
    list,
    board,
    assignee,
    assignees: assigneesFromBody,
    members,
    labels,
    priority,
    dueDate,
    startDate,
    position,
  } = req.body;

  const resolvedAssignees = Array.isArray(assigneesFromBody)
    ? assigneesFromBody
    : assignee
      ? [assignee]
      : [];

  // Get the list and count cards in parallel
  const [cardList, cardCount] = await Promise.all([
    List.findById(list).lean(),
    position === undefined || position === null ? Card.countDocuments({ list }) : Promise.resolve(position)
  ]);
  
  if (!cardList) {
    return next(new ErrorResponse("List not found", 404));
  }

  const card = await Card.create({
    title,
    description,
    list,
    board,
    assignees: resolvedAssignees,
    members: members || [],
    labels: labels || [],
    priority,
    dueDate,
    startDate,
    status: cardList.title.toLowerCase().replace(/\s+/g, '-'),
    position: cardCount,
    createdBy: req.user.id,
  });

  // Log activity
  await Activity.create({
    type: "card_created",
    description: `Created card "${title}"`,
    user: req.user.id,
    board,
    card: card._id,
    list,
    contextType: 'task'
  });

  // Emit real-time update to board
  emitToBoard(board, 'card-created', {
    card,
    listId: list,
    createdBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  // Send notifications using the notification service
  if (resolvedAssignees.length > 0) {
    await notificationService.notifyTaskAssigned(card, resolvedAssignees, req.user.id);

    // Send Slack notifications for task assignment
    const boardData = await Board.findById(board).select('name department').lean();
    slackHooks.onTaskAssigned(card, boardData, resolvedAssignees, req.user).catch(console.error);

    // Dispatch chat webhook for task creation + assignment
    chatHooks.onTaskCreated(card, boardData, req.user).catch(console.error);
    chatHooks.onTaskAssigned(card, resolvedAssignees, boardData, req.user).catch(console.error);
  }

  // Notify all members
  if (members && members.length > 0) {
    for (const memberId of members) {
      if (memberId.toString() !== req.user.id && memberId.toString() !== assignee?.toString()) {
        await notificationService.createNotification({
          type: "member_added",
          title: "Added to Task",
          message: `${req.user.name} added you to "${title}"`,
          user: memberId,
          sender: req.user.id,
          relatedCard: card._id,
          relatedBoard: board,
        });
      }
    }
  }

  const populatedCard = await Card.findById(card._id)
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .lean();

  res.status(201).json({
    success: true,
    data: populatedCard,
  });
});

// @desc    Update card
// @route   PUT /api/cards/:id
// @access  Private
export const updateCard = asyncHandler(async (req, res, next) => {
  let card = await Card.findById(req.params.id);

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const originalBoardId = card.board;
  const originalListId = card.list;

  // Store old values for change detection
  const oldAssignees = card.assignees?.map(a => a.toString()) || [];
  const oldDueDate = card.dueDate;
  const oldStatus = card.status;
  const oldDescription = card.description || '';
  const oldLabels = card.labels?.map(l => l.toString()) || [];
  const oldPriority = card.priority || '';
  const oldTitle = card.title || '';
  const oldStartDate = card.startDate;

  /**
   * Process time tracking updates with strict ownership preservation
   * Uses centralized utility for consistent ownership rules across all entities
   * 
   * CRITICAL RULES:
   * - Only the creator can edit/delete their entries
   * - Other users' entries are always preserved
   * - New entries are always assigned to req.user
   */
  const currentUser = { id: req.user.id, name: req.user.name };
  const timeEntryWarnings = [];

  // Process time tracking updates with strict ownership rules
  try {
    if (req.body.estimationTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.estimationTime, 
        card.estimationTime, 
        currentUser, 
        'estimation'
      );
      req.body.estimationTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    }
    if (req.body.loggedTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.loggedTime, 
        card.loggedTime, 
        currentUser, 
        'logged'
      );
      req.body.loggedTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    }
    if (req.body.billedTime !== undefined) {
      const result = processTimeEntriesWithOwnership(
        req.body.billedTime, 
        card.billedTime, 
        currentUser, 
        'billed'
      );
      req.body.billedTime = result.entries;
      if (result.errors.length > 0) {
        timeEntryWarnings.push(...result.errors);
      }
    }
  } catch (validationError) {
    return next(new ErrorResponse(validationError.message, 400));
  }

  card = await Card.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .populate("coverImage", "url secureUrl thumbnailUrl fileName fileType")
    .populate("estimationTime.user", "name email avatar")
    .populate("loggedTime.user", "name email avatar")
    .populate("billedTime.user", "name email avatar")
    .lean();

  // Log specific activity types based on what changed - compare to OLD values
  if (req.body.title && req.body.title !== oldTitle) {
    await Activity.create({
      type: "title_changed",
      description: `Changed title from "${oldTitle}" to "${req.body.title}"`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldTitle: oldTitle,
        newTitle: req.body.title
      }
    });
  }

  if (req.body.description !== undefined && req.body.description !== oldDescription) {
    // Save version history for description (content is required, use stripped htmlContent or placeholder)
    const descriptionContent = oldDescription 
      ? oldDescription.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() 
      : '';
    
    await VersionHistory.createVersion({
      entityType: 'card_description',
      entityId: card._id,
      content: descriptionContent || '(empty)',
      htmlContent: oldDescription || '',
      mentions: card.descriptionMentions || [],
      editedBy: req.user.id,
      card: card._id,
      board: card.board,
      changeType: 'edited'
    });

    await Activity.create({
      type: "description_changed",
      description: `Updated the task description`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        hasDescription: !!req.body.description
      }
    });

    // Get version count for the response
    const versionCount = await VersionHistory.getVersionCount('card_description', card._id);

    // Emit real-time description update with version info
    emitToBoard(card.board.toString(), 'description-updated', {
      cardId: card._id,
      description: req.body.description,
      versionCount,
      updatedBy: {
        id: req.user.id,
        name: req.user.name
      }
    });
  }

  if (req.body.status && req.body.status !== oldStatus) {
    await Activity.create({
      type: "status_changed",
      description: `Changed status from "${oldStatus}" to "${req.body.status}"`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldStatus: oldStatus,
        newStatus: req.body.status
      }
    });
  }

  if (req.body.priority && req.body.priority !== oldPriority) {
    await Activity.create({
      type: "priority_changed",
      description: `Changed priority from "${oldPriority || 'None'}" to "${req.body.priority}"`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldPriority: oldPriority || 'None',
        newPriority: req.body.priority
      }
    });
  }

  // Compare dueDate using timestamps for proper comparison
  const newDueDateStr = req.body.dueDate ? new Date(req.body.dueDate).toISOString() : null;
  const oldDueDateStr = oldDueDate ? new Date(oldDueDate).toISOString() : null;
  if (req.body.dueDate !== undefined && newDueDateStr !== oldDueDateStr) {
    // Format dates for user-friendly display
    const formatDate = (date) => {
      if (!date) return 'None';
      return new Date(date).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    };
    const oldDateFormatted = formatDate(oldDueDate);
    const newDateFormatted = formatDate(req.body.dueDate);
    
    await Activity.create({
      type: "due_date_changed",
      description: `Changed due date from ${oldDateFormatted} to ${newDateFormatted}`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldDate: oldDateFormatted,
        newDate: newDateFormatted
      }
    });
  }

  if (req.body.estimationTime) {
    const newEstimations = req.body.estimationTime || [];
    const oldEstimations = card.estimationTime || [];
    
    // Check for new estimations
    if (newEstimations.length > oldEstimations.length) {
      const lastEntry = newEstimations[newEstimations.length - 1];
      if (!lastEntry._id) {
        await Activity.create({
          type: "estimation_updated",
          description: `Updated estimation to ${lastEntry.hours}h ${lastEntry.minutes}m`,
          user: req.user.id,
          board: card.board,
          card: card._id,
          contextType: 'task',
          metadata: {
            hours: lastEntry.hours,
            minutes: lastEntry.minutes,
            reason: lastEntry.reason
          }
        });
      }
    }
  }

  if (req.body.loggedTime) {
    const newLogged = req.body.loggedTime || [];
    const oldLogged = card.loggedTime || [];
    
    // Check for new logged time
    if (newLogged.length > oldLogged.length) {
      const lastEntry = newLogged[newLogged.length - 1];
      if (!lastEntry._id) {
        await Activity.create({
          type: "time_logged",
          description: `Logged ${lastEntry.hours}h ${lastEntry.minutes}m of work`,
          user: req.user.id,
          board: card.board,
          card: card._id,
          contextType: 'task',
          metadata: {
            hours: lastEntry.hours,
            minutes: lastEntry.minutes,
            description: lastEntry.description
          }
        });

        // Dispatch chat webhook for time entry
        const boardForTime = await Board.findById(card.board).select('name department').lean();
        chatHooks.onTimeEntryAdded(card, lastEntry, boardForTime, req.user).catch(console.error);
      }
    }
    
    // Emit finance data refresh for logged time changes
    emitFinanceDataRefresh({
      changeType: 'logged_time',
      cardId: card._id.toString(),
      boardId: card.board.toString()
    });
  }
  
  // Emit finance data refresh for billed time changes
  if (req.body.billedTime) {
    emitFinanceDataRefresh({
      changeType: 'billed_time',
      cardId: card._id.toString(),
      boardId: card.board.toString()
    });
  }

  // Labels change detection - only log if labels actually changed
  if (req.body.labels !== undefined) {
    const newLabels = (req.body.labels || []).map(l => l.toString()).sort();
    const sortedOldLabels = [...oldLabels].sort();
    
    if (JSON.stringify(newLabels) !== JSON.stringify(sortedOldLabels)) {
      try {
        const labelDocs = await Label.find({ _id: { $in: req.body.labels } }).select('name');
        const labelNames = labelDocs.map(l => l.name).join(', ');
        const oldLabelDocs = await Label.find({ _id: { $in: oldLabels } }).select('name');
        const oldLabelNames = oldLabelDocs.map(l => l.name).join(', ') || 'None';
        
        await Activity.create({
          type: 'labels_changed',
          description: `Changed labels from "${oldLabelNames}" to "${labelNames || 'None'}"`,
          user: req.user.id,
          board: card.board,
          card: card._id,
          contextType: 'task',
          metadata: {
            oldLabels: oldLabelNames,
            newLabels: labelNames || 'None'
          }
        });
      } catch (err) {
        console.error('Error creating labels activity:', err);
      }
    }
  }

  // Emit real-time update
  emitToBoard(card.board.toString(), 'card-updated', {
    cardId: card._id,
    updates: req.body,
    updatedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  // If description was updated, detect mentions and notify mentioned users
  if (req.body.description) {
    await notificationService.processMentions(req.body.description, card, req.user.id);
  }

  // Normalize single assignee payloads
  if (req.body.assignees === undefined && req.body.assignee !== undefined) {
    req.body.assignees = req.body.assignee ? [req.body.assignee] : [];
  }

  // Notify if assignees changed (only if actually changed)
  if (req.body.assignees !== undefined) {
    const newAssignees = req.body.assignees || [];
    const addedAssignees = newAssignees.filter(id => !oldAssignees.includes(id.toString()));
    const removedAssignees = oldAssignees.filter(id => !newAssignees.includes(id));

    if (addedAssignees.length > 0) {
      await notificationService.notifyTaskAssigned(card, addedAssignees, req.user.id);
      
      // Fetch names for activity log
      const addedUsers = await User.find({ _id: { $in: addedAssignees } }).select('name');
      const memberNames = addedUsers.map(u => u.name).join(', ');
      
      await Activity.create({
        type: 'member_added',
        description: `added members to the card`,
        user: req.user.id,
        board: card.board,
        card: card._id,
        contextType: 'task',
        metadata: {
          memberName: memberNames,
          memberIds: addedAssignees
        }
      });
      
      // Send Slack notifications for new assignees
      const boardData = await Board.findById(card.board).select('name department').lean();
      slackHooks.onTaskAssigned(card, boardData, addedAssignees, req.user).catch(console.error);

      // Dispatch chat webhook for assignee changes
      chatHooks.onTaskAssigned(card, addedAssignees, boardData, req.user).catch(console.error);
    }

    if (removedAssignees.length > 0) {
      // Fetch names for activity log
      const removedUsers = await User.find({ _id: { $in: removedAssignees } }).select('name');
      const memberNames = removedUsers.map(u => u.name).join(', ');

      await Activity.create({
        type: 'member_removed',
        description: `removed members from the card`,
        user: req.user.id,
        board: card.board,
        card: card._id,
        contextType: 'task',
        metadata: {
          memberName: memberNames,
          memberIds: removedAssignees
        }
      });
    }
  }

  // ============ COMPREHENSIVE NOTIFICATION LOGIC ============
  // Track all field changes to send appropriate notifications
  const changedFields = [];
  
  // Check description change
  const newDescription = req.body.description !== undefined ? (req.body.description || '') : undefined;
  if (newDescription !== undefined && newDescription !== oldDescription) {
    changedFields.push({ field: 'description', message: `Description updated for "${card.title}"` });
  }
  
  // Check labels change
  if (req.body.labels !== undefined) {
    const newLabels = (req.body.labels || []).map(l => l.toString()).sort();
    const sortedOldLabels = [...oldLabels].sort();
    if (JSON.stringify(newLabels) !== JSON.stringify(sortedOldLabels)) {
      changedFields.push({ field: 'labels', message: `Labels updated for "${card.title}"` });
    }
  }
  
  // Check priority change
  if (req.body.priority !== undefined && (req.body.priority || '') !== oldPriority) {
    changedFields.push({ field: 'priority', message: `Priority changed to "${req.body.priority || 'None'}" for "${card.title}"` });
  }
  
  // Check title change  
  if (req.body.title !== undefined && req.body.title !== oldTitle) {
    changedFields.push({ field: 'title', message: `Task renamed to "${req.body.title}"` });
  }
  
  // Check due date change (normalize to timestamps for proper comparison)
  const oldDueDateMs = oldDueDate ? new Date(oldDueDate).getTime() : null;
  const newDueDateMs = req.body.dueDate !== undefined ? (req.body.dueDate ? new Date(req.body.dueDate).getTime() : null) : undefined;
  if (newDueDateMs !== undefined && oldDueDateMs !== newDueDateMs) {
    const dateStr = req.body.dueDate ? new Date(req.body.dueDate).toLocaleDateString() : 'removed';
    changedFields.push({ field: 'dueDate', message: `Due date ${req.body.dueDate ? 'changed to ' + dateStr : 'removed'} for "${card.title}"` });
  }
  
  // Check start date change
  const oldStartDateMs = oldStartDate ? new Date(oldStartDate).getTime() : null;
  const newStartDateMs = req.body.startDate !== undefined ? (req.body.startDate ? new Date(req.body.startDate).getTime() : null) : undefined;
  if (newStartDateMs !== undefined && oldStartDateMs !== newStartDateMs) {
    changedFields.push({ field: 'startDate', message: `Start date updated for "${card.title}"` });
  }
  
  // Check status change (special handling for 'done')
  if (req.body.status !== undefined && req.body.status !== oldStatus) {
    if (req.body.status === 'done') {
      changedFields.push({ field: 'status', message: `"${card.title}" has been marked as complete`, special: 'done' });
    } else {
      changedFields.push({ field: 'status', message: `Status changed to "${req.body.status}" for "${card.title}"` });
    }
    
    // Send Slack notification for status change
    const boardData = await Board.findById(card.board).select('name').lean();
    if (req.body.status === 'done') {
      slackHooks.onTaskCompleted(card, boardData, req.user).catch(console.error);
    } else {
      slackHooks.onTaskStatusChanged(card, boardData, oldStatus, req.body.status, req.user).catch(console.error);
    }

    // Dispatch chat webhook for status change
    chatHooks.onTaskStatusChanged(card, oldStatus, req.body.status, boardData, req.user).catch(console.error);
  }
  
  // Send notifications based on changes (only if card has assignees to notify)
  if (changedFields.length > 0 && card.assignees && card.assignees.length > 0) {
    // Exclude assignee changes from this count (they're handled separately above)
    const notificationChanges = changedFields;
    
    if (notificationChanges.length === 1) {
      // Single field changed - send specific notification
      const change = notificationChanges[0];
      await notificationService.notifyTaskUpdated(card, req.user.id, { 
        [change.field]: true,
        message: change.message 
      });
    } else if (notificationChanges.length > 1) {
      // Multiple fields changed - send generic "Task Updated" notification
      await notificationService.notifyTaskUpdated(card, req.user.id, { 
        multipleChanges: true,
        changedFields: notificationChanges.map(c => c.field)
      });
    }
    
    // Send Slack notification for task updates (except status changes which are handled above)
    const nonStatusChanges = changedFields.filter(c => c.field !== 'status');
    if (nonStatusChanges.length > 0) {
      const boardData = await Board.findById(card.board).select('name').lean();
      slackHooks.onTaskUpdated(card, boardData, nonStatusChanges.map(c => c.field), req.user).catch(console.error);
    }

    // Dispatch chat webhook for general task update
    const boardInfo = await Board.findById(card.board).select('name department').lean();
    chatHooks.onTaskUpdated(card, { changedFields: changedFields.map(c => c.field) }, boardInfo, req.user).catch(console.error);
  }

  res.status(200).json({
    success: true,
    data: card,
  });
});

// @desc    Move card
// @route   PUT /api/cards/:id/move
// @access  Private
export const moveCard = asyncHandler(async (req, res, next) => {
  const { destinationListId, newPosition } = req.body;
  const card = await Card.findById(req.params.id)
    .populate('list', 'title')
    .populate('board');

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const sourceListId = card.list._id;
  const sourceListTitle = card.list.title;
  const oldPosition = card.position;
  
  // Get the destination list to update status
  const destinationList = await List.findById(destinationListId);
  if (!destinationList) {
    return next(new ErrorResponse("Destination list not found", 404));
  }

  // Store old status for notifications
  const oldStatus = card.status;

  // If moving within same list
  if (sourceListId.toString() === destinationListId) {
    if (newPosition === oldPosition) {
      return res.status(200).json({ success: true, data: card });
    }

    if (newPosition > oldPosition) {
      await Card.updateMany(
        {
          list: sourceListId,
          position: { $gt: oldPosition, $lte: newPosition },
        },
        { $inc: { position: -1 } }
      );
    } else {
      await Card.updateMany(
        {
          list: sourceListId,
          position: { $gte: newPosition, $lt: oldPosition },
        },
        { $inc: { position: 1 } }
      );
    }

    card.position = newPosition;
  } else {
    // Moving to different list
    // Update positions in source list
    await Card.updateMany(
      {
        list: sourceListId,
        position: { $gt: oldPosition },
      },
      { $inc: { position: -1 } }
    );

    // Update positions in destination list
    await Card.updateMany(
      {
        list: destinationListId,
        position: { $gte: newPosition },
      },
      { $inc: { position: 1 } }
    );

    card.list = destinationListId;
    card.position = newPosition;

    // Update status based on list title - use exact normalized title
    const destList = await List.findById(destinationListId);
    card.status = destList.title.toLowerCase().replace(/\s+/g, '-');
  }

  await card.save();

  // OPTIMIZATION: Send response immediately to make UI feel instant
  // Run side effects (Activity, Notifications, Sockets, Cache) in background
  res.status(200).json({
    success: true,
    data: card,
  });

  // Background tasks - do not await these before sending response
  (async () => {
    try {
      // Log activity
      await Activity.create({
        type: "card_moved",
        description: `Moved card "${card.title}"`,
        user: req.user.id,
        board: card.board,
        card: card._id,
        list: card.list,
        contextType: 'task',
        metadata: {
          fromList: sourceListTitle,
          toList: destinationList.title,
          newPosition
        }
      });

      // Emit real-time updates for both move and status change
      emitToBoard(card.board.toString(), 'card-moved', {
        cardId: card._id,
        sourceListId,
        destinationListId,
        newPosition,
        status: card.status,
        movedBy: {
          id: req.user.id,
          name: req.user.name
        }
      });

      // Also emit a card-updated event for status change
      emitToBoard(card.board.toString(), 'card-updated', {
        cardId: card._id,
        updates: {
          list: destinationListId,
          position: newPosition,
          status: card.status
        },
        updatedBy: {
          id: req.user.id,
          name: req.user.name
        }
      });

      // Send notifications for task movement
      if (sourceListId.toString() !== destinationListId) {
        await notificationService.notifyTaskUpdated(card, req.user.id, {
          moved: true,
          fromList: sourceListTitle,
          toList: destinationList.title
        });
      }

    } catch (backgroundError) {
      console.error("Error in moveCard background tasks:", backgroundError);
      // Do not crash or send error to response as it's already sent
    }
  })();
});

// @desc    Delete card
// @route   DELETE /api/cards/:id
// @access  Private
export const deleteCard = asyncHandler(async (req, res, next) => {
  const card = await Card.findById(req.params.id).select('board title assignees members list').lean();

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const boardId = card.board;

  // Send notifications before deletion
  await notificationService.notifyTaskDeleted(card, req.user.id);

  // Dispatch chat webhook before deletion
  const boardForDelete = await Board.findById(card.board).select('name department').lean();
  chatHooks.onTaskDeleted(card, boardForDelete, req.user).catch(console.error);

  // Log activity before deletion
  await Activity.create({
    type: "card_deleted",
    description: `Deleted card "${card.title}"`,
    user: req.user.id,
    board: card.board,
    list: card.list,
  });

  // Emit real-time update
  emitToBoard(boardId.toString(), 'card-deleted', {
    cardId: card._id,
    listId: card.list,
    deletedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  await Card.findByIdAndDelete(card._id);

  res.status(200).json({
    success: true,
    message: "Card deleted successfully",
  });
});

// @desc    Get card activity logs
// @route   GET /api/cards/:id/activity
// @access  Private
export const getCardActivity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 100, page = 1 } = req.query;

  // Verify card exists and user has access
  const card = await Card.findById(id).select('_id board').lean();
  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  // Get all activities for this card
  const activities = await Activity.find({ card: id, contextType: 'task' })
    .populate("user", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .lean();

  const total = await Activity.countDocuments({ card: id, contextType: 'task' });

  res.status(200).json({
    success: true,
    count: activities.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    data: activities,
  });
});

// @desc    Archive a card (task only, not subtask/nano)
// @route   PUT /api/cards/:id/archive
// @access  Private
export const archiveCard = asyncHandler(async (req, res, next) => {
  const card = await Card.findById(req.params.id);

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const now = new Date();

  // Mark as archived
  card.isArchived = true;
  card.archivedAt = now;
  // Auto-delete after 30 days
  card.autoDeleteAt = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  await card.save();

  // Log activity
  await Activity.create({
    type: "card_archived",
    description: `Archived card "${card.title}"`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    contextType: 'task',
  });

  // Emit real-time update
  emitToBoard(card.board.toString(), 'card-archived', {
    cardId: card._id,
    listId: card.list,
    archivedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  res.status(200).json({
    success: true,
    message: "Card archived successfully",
    data: card,
  });
});

// @desc    Restore an archived card
// @route   PUT /api/cards/:id/restore
// @access  Private
export const restoreCard = asyncHandler(async (req, res, next) => {
  const card = await Card.findById(req.params.id);

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  if (!card.isArchived) {
    return next(new ErrorResponse("Card is not archived", 400));
  }

  const now = new Date();

  if (card.autoDeleteAt && card.autoDeleteAt <= now) {
    return next(new ErrorResponse("Archived task is past its restore window", 410));
  }

  // Unarchive the card
  card.isArchived = false;
  card.archivedAt = null;
  card.autoDeleteAt = null;
  
  // Move to end of original list (or first position if list is empty)
  const maxPositionCard = await Card.findOne({ 
    list: card.list, 
    isArchived: false 
  }).sort({ position: -1 }).select('position').lean();
  
  card.position = (maxPositionCard?.position ?? -1) + 1;
  await card.save();

  // Log activity
  await Activity.create({
    type: "card_restored",
    description: `Restored card "${card.title}" from archive`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    contextType: 'task',
  });

  // Emit real-time update
  emitToBoard(card.board.toString(), 'card-restored', {
    cardId: card._id,
    listId: card.list,
    restoredBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  res.status(200).json({
    success: true,
    message: "Card restored successfully",
    data: card,
  });
});

// @desc    Get archived cards for a list or board
// @route   GET /api/cards/list/:listId/archived
// @access  Private
export const getArchivedCards = asyncHandler(async (req, res, next) => {
  const { listId } = req.params;
  const { boardId } = req.query;
  const { page = 1, limit = 50 } = req.query;

  const now = new Date();

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Use aggregation pipeline for archived cards
  const pipeline = [
    { 
      $match: { 
        ...(listId && listId !== 'all' ? { list: new mongoose.Types.ObjectId(listId) } : {}),
        ...(boardId ? { board: new mongoose.Types.ObjectId(boardId) } : {}),
        isArchived: true,
        $or: [
          { autoDeleteAt: { $exists: false } },
          { autoDeleteAt: null },
          { autoDeleteAt: { $gt: now } }
        ]
      } 
    },
    { $sort: { position: 1 } },
    { $skip: skip },
    { $limit: limitNum },
    // Lookup assignees
    {
      $lookup: {
        from: 'users',
        localField: 'assignees',
        foreignField: '_id',
        as: 'assignees',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup members
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        as: 'members',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }]
      }
    },
    // Lookup labels
    {
      $lookup: {
        from: 'labels',
        let: { labelIds: { $ifNull: ['$labels', []] } },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  { $toString: '$_id' },
                  {
                    $map: {
                      input: '$$labelIds',
                      as: 'lid',
                      in: { $toString: '$$lid' }
                    }
                  }
                ]
              }
            }
          },
          { $project: { name: 1, color: 1 } }
        ],
        as: 'labels'
      }
    },
    // Lookup coverImage from attachments
    {
      $lookup: {
        from: 'attachments',
        localField: 'coverImage',
        foreignField: '_id',
        as: 'coverImageArr',
        pipeline: [{ $project: { url: 1, secureUrl: 1, thumbnailUrl: 1, fileName: 1, fileType: 1, isCover: 1 } }]
      }
    },
    // Add computed fields
    {
      $addFields: {
        coverImage: { $arrayElemAt: ['$coverImageArr', 0] }
      }
    },
    // Clean up temporary fields
    { $project: { coverImageArr: 0 } }
  ];

  const countFilter = {
    ...(listId && listId !== 'all' ? { list: listId } : {}),
    ...(boardId ? { board: boardId } : {}),
    isArchived: true,
    $or: [
      { autoDeleteAt: { $exists: false } },
      { autoDeleteAt: null },
      { autoDeleteAt: { $gt: now } }
    ]
  };

  const [cards, countResult] = await Promise.all([
    Card.aggregate(pipeline),
    Card.countDocuments(countFilter)
  ]);

  res.status(200).json({
    success: true,
    count: countResult,
    pagination: {
      currentPage: pageNum,
      totalPages: Math.ceil(countResult / limitNum),
      hasNext: pageNum * limitNum < countResult,
      hasPrev: pageNum > 1
    },
    data: cards,
  });
});

// @desc    Add time tracking entry
// @route   POST /api/cards/:id/time-tracking
// @access  Private
export const addTimeEntry = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { type, entry } = req.body;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const card = await Card.findById(id);
  if (!card) {
    return next(new ErrorResponse('Card not found', 404));
  }

  const fieldName = `${type}Time`;
  
  // Create valid entry with new ID
  const newEntry = {
    ...entry,
    user: req.user.id, // Enforce current user as owner
    _id: new mongoose.Types.ObjectId()
  };

  // Ensure hours/minutes are integers
  if (newEntry.hours) newEntry.hours = parseInt(newEntry.hours) || 0;
  if (newEntry.minutes) newEntry.minutes = parseInt(newEntry.minutes) || 0;

  // Add to array
  card[fieldName].push(newEntry);
  await card.save();

  // Populate user info for response
  await card.populate(`${fieldName}.user`, 'name email avatar');
  
  // Find the newly added entry to return
  const addedEntry = card[fieldName].find(e => e._id.toString() === newEntry._id.toString());
  
  // Log activity
  await Activity.create({
    type: 'time_logged',
    description: `Added ${type} time entry (${newEntry.hours}h ${newEntry.minutes}m)`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    contextType: 'task',
    metadata: {
        timeType: type,
        hours: newEntry.hours,
        minutes: newEntry.minutes
    }
  });

  // Emit socket event
  emitToBoard(card.board.toString(), 'card-updated', {
    cardId: card._id,
    updates: {
      [fieldName]: card[fieldName]
    }
  });

  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      cardId: card._id.toString(),
      boardId: card.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: addedEntry
  });
});

// @desc    Update time tracking entry
// @route   PUT /api/cards/:id/time-tracking/:entryId
// @access  Private
export const updateTimeEntry = asyncHandler(async (req, res, next) => {
  const { id, entryId } = req.params;
  const { type, updates } = req.body;

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const card = await Card.findById(id);
  if (!card) {
    return next(new ErrorResponse('Card not found', 404));
  }

  const fieldName = `${type}Time`;
  const entryIndex = card[fieldName].findIndex(e => e._id.toString() === entryId);

  if (entryIndex === -1) {
    return next(new ErrorResponse('Time entry not found', 404));
  }

  const entry = card[fieldName][entryIndex];

  // check ownership
  if (entry.user.toString() !== req.user.id.toString()) {
     return next(new ErrorResponse('Not authorized to update this time entry', 403));
  }

  // Update fields
  if (updates.hours !== undefined) entry.hours = parseInt(updates.hours) || 0;
  if (updates.minutes !== undefined) entry.minutes = parseInt(updates.minutes) || 0;
  if (updates.date !== undefined) entry.date = updates.date;
  if (updates.reason !== undefined && type === 'estimation') entry.reason = updates.reason;
  if (updates.description !== undefined && type !== 'estimation') entry.description = updates.description;

  await card.save();
  await card.populate(`${fieldName}.user`, 'name email avatar');
  const updatedEntry = card[fieldName][entryIndex];

  // Log activity
  await Activity.create({
    type: 'time_logged',
    description: `Updated ${type} time entry`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    contextType: 'task'
  });

  emitToBoard(card.board.toString(), 'card-updated', {
    cardId: card._id,
    updates: {
      [fieldName]: card[fieldName]
    }
  });
  
  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      cardId: card._id.toString(),
      boardId: card.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: updatedEntry
  });
});

// @desc    Delete time tracking entry
// @route   DELETE /api/cards/:id/time-tracking/:entryId
// @access  Private
export const deleteTimeEntry = asyncHandler(async (req, res, next) => {
  const { id, entryId } = req.params;
  const { type } = req.query; // Pass type as query param

  if (!['estimation', 'logged', 'billed'].includes(type)) {
    return next(new ErrorResponse('Invalid time entry type', 400));
  }

  const card = await Card.findById(id);
  if (!card) {
    return next(new ErrorResponse('Card not found', 404));
  }

  const fieldName = `${type}Time`;
  const entryIndex = card[fieldName].findIndex(e => e._id.toString() === entryId);

  if (entryIndex === -1) {
    return next(new ErrorResponse('Time entry not found', 404));
  }

  const entry = card[fieldName][entryIndex];

  // check ownership
  if (entry.user.toString() !== req.user.id.toString()) {
     return next(new ErrorResponse('Not authorized to delete this time entry', 403));
  }

  // Remove from array
  card[fieldName].splice(entryIndex, 1);
  await card.save();

  // Log activity
  await Activity.create({
    type: 'time_logged',
    description: `Deleted ${type} time entry`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    contextType: 'task'
  });

  emitToBoard(card.board.toString(), 'card-updated', {
    cardId: card._id,
    updates: {
      [fieldName]: card[fieldName]
    }
  });

  if (type === 'logged' || type === 'billed') {
    emitFinanceDataRefresh({
      changeType: type === 'billed' ? 'billed_time' : 'logged_time',
      cardId: card._id.toString(),
      boardId: card.board.toString()
    });
  }

  res.status(200).json({
    success: true,
    data: { _id: entryId }
  });
});

// ============================================================
// HELPER: Re-map labels from source board to destination board
// Finds or creates matching labels in destination board
// ============================================================
const remapLabels = async (labelIds, sourceBoardId, destBoardId) => {
  if (!labelIds || labelIds.length === 0) return [];
  if (sourceBoardId.toString() === destBoardId.toString()) return labelIds;

  const sourceLabels = await Label.find({ _id: { $in: labelIds } }).lean();
  const newLabelIds = [];

  for (const sourceLabel of sourceLabels) {
    // Find or create matching label in destination board
    const destLabel = await Label.findOneAndUpdate(
      { board: destBoardId, name: sourceLabel.name, color: sourceLabel.color },
      { $setOnInsert: { board: destBoardId, name: sourceLabel.name, color: sourceLabel.color, createdBy: sourceLabel.createdBy } },
      { upsert: true, new: true }
    );
    newLabelIds.push(destLabel._id);
  }

  return newLabelIds;
};

// HELPER: Update recent destinations for a user
const updateRecentDestinations = async (userId, destination) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const destinations = user.recentCopyMoveDestinations || [];
    
    // Remove duplicate if exists
    const filtered = destinations.filter(d =>
      !(d.departmentId?.toString() === destination.departmentId?.toString() &&
        d.projectId?.toString() === destination.projectId?.toString() &&
        d.listId?.toString() === destination.listId?.toString())
    );

    // Add new at front, cap at 5
    filtered.unshift({ ...destination, usedAt: new Date() });
    user.recentCopyMoveDestinations = filtered.slice(0, 5);
    await user.save();
  } catch (err) {
    console.error('Error updating recent destinations:', err);
  }
};

// @desc    Copy a card to another board/list
// @route   POST /api/cards/:id/copy
// @access  Private (Admin/Manager)
export const copyCard = asyncHandler(async (req, res, next) => {
  const { destinationBoardId, destinationListId, options = {} } = req.body;
  const {
    copyComments = true,
    copyAttachments = true,
    copyChecklist = true,
    copyAssignees = true,
    copyDueDates = true
  } = options;

  // Load source card
  const sourceCard = await Card.findById(req.params.id).lean();
  if (!sourceCard) {
    return next(new ErrorResponse("Card not found", 404));
  }

  // Validate destination
  const destBoard = await Board.findById(destinationBoardId).lean();
  if (!destBoard) {
    return next(new ErrorResponse("Destination project not found", 404));
  }

  const destList = await List.findById(destinationListId);
  if (!destList) {
    return next(new ErrorResponse("Destination list not found", 404));
  }

  // Get position (append to end of destination list)
  const maxPosCard = await Card.findOne({ list: destinationListId, isArchived: false })
    .sort({ position: -1 }).select('position').lean();
  const newPosition = (maxPosCard?.position ?? -1) + 1;

  // Re-map labels to destination board
  const newLabels = await remapLabels(sourceCard.labels, sourceCard.board, destinationBoardId);

  // Build new card data
  const newCardData = {
    title: `${sourceCard.title}`,
    description: sourceCard.description || '',
    descriptionMentions: sourceCard.descriptionMentions || [],
    list: destinationListId,
    board: destinationBoardId,
    position: newPosition,
    assignees: copyAssignees ? (sourceCard.assignees || []) : [],
    members: copyAssignees ? (sourceCard.members || []) : [],
    labels: newLabels,
    priority: sourceCard.priority,
    status: destList.title.toLowerCase().replace(/\s+/g, '-'),
    dueDate: copyDueDates ? sourceCard.dueDate : null,
    startDate: copyDueDates ? sourceCard.startDate : null,
    subtaskStats: { total: 0, completed: 0, nanoTotal: 0, nanoCompleted: 0 },
    // Skip all time entries
    estimationTime: [],
    loggedTime: [],
    billedTime: [],
    // Reset archive state
    isArchived: false,
    archivedAt: null,
    autoDeleteAt: null,
    createdBy: req.user.id,
    createdFrom: 'board'
  };

  // Copy embedded attachments if requested
  if (copyAttachments && sourceCard.attachments?.length > 0) {
    newCardData.attachments = sourceCard.attachments.map(att => ({
      filename: att.filename,
      originalName: att.originalName,
      mimetype: att.mimetype,
      size: att.size,
      url: att.url,
      uploadedBy: att.uploadedBy,
      isCover: false,
      createdAt: new Date()
    }));
  }

  const newCard = await Card.create(newCardData);

  // Populate for response
  const populatedCard = await Card.findById(newCard._id)
    .populate('assignees', 'name email avatar')
    .populate('members', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .lean();

  // Send response immediately (optimistic for client)
  res.status(201).json({
    success: true,
    data: populatedCard,
    message: 'Task copied successfully'
  });

  // ===== Background async processing =====
  (async () => {
    try {
      // 1. Copy comments if requested
      if (copyComments) {
        const comments = await Comment.find({ card: sourceCard._id, contextType: 'card' }).lean();
        if (comments.length > 0) {
          const commentDocs = comments.map(c => ({
            text: c.text,
            htmlContent: c.htmlContent,
            card: newCard._id,
            contextType: 'card',
            contextRef: newCard._id,
            user: c.user,
            mentions: c.mentions || [],
            attachments: c.attachments || [],
            isEdited: false,
            editHistory: [],
            reactions: [],
            isPinned: false,
            replyCount: 0
          }));
          await Comment.insertMany(commentDocs);
        }
      }

      // 2. Copy attachments (Attachment model records) if requested
      if (copyAttachments) {
        const attachments = await Attachment.find({
          contextRef: sourceCard._id,
          contextType: 'card',
          isDeleted: false
        }).lean();
        if (attachments.length > 0) {
          const attDocs = attachments.map(a => ({
            fileName: a.fileName,
            originalName: a.originalName,
            fileType: a.fileType,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            url: a.url,
            secureUrl: a.secureUrl,
            publicId: a.publicId,
            resourceType: a.resourceType,
            format: a.format,
            thumbnailUrl: a.thumbnailUrl,
            previewUrl: a.previewUrl,
            contextType: 'card',
            contextRef: newCard._id,
            card: newCard._id,
            board: destinationBoardId,
            uploadedBy: a.uploadedBy,
            width: a.width,
            height: a.height,
            duration: a.duration,
            pages: a.pages,
            fileExtension: a.fileExtension,
            isCover: false,
            isDeleted: false,
            departmentId: destBoard.department
          }));
          await Attachment.insertMany(attDocs);
        }
      }

      // 3. Copy subtasks (checklist) if requested
      if (copyChecklist) {
        const subtasks = await Subtask.find({ task: sourceCard._id }).lean();
        if (subtasks.length > 0) {
          for (const st of subtasks) {
            const newSubtask = await Subtask.create({
              task: newCard._id,
              board: destinationBoardId,
              title: st.title,
              description: st.description,
              status: st.status,
              priority: st.priority,
              assignees: copyAssignees ? (st.assignees || []) : [],
              watchers: [],
              tags: await remapLabels(st.tags, sourceCard.board, destinationBoardId),
              dueDate: copyDueDates ? st.dueDate : null,
              startDate: copyDueDates ? st.startDate : null,
              attachments: copyAttachments ? (st.attachments || []) : [],
              colorToken: st.colorToken,
              estimationTime: [],
              loggedTime: [],
              billedTime: [],
              order: st.order,
              createdBy: req.user.id,
              breadcrumbs: { project: destBoard.name, task: newCard.title }
            });

            // Copy nano-subtasks
            const nanos = await SubtaskNano.find({ subtask: st._id }).lean();
            if (nanos.length > 0) {
              const nanoDocs = await Promise.all(nanos.map(async n => ({
                subtask: newSubtask._id,
                task: newCard._id,
                board: destinationBoardId,
                title: n.title,
                description: n.description,
                status: n.status,
                priority: n.priority,
                assignees: copyAssignees ? (n.assignees || []) : [],
                dueDate: copyDueDates ? n.dueDate : null,
                startDate: copyDueDates ? n.startDate : null,
                tags: await remapLabels(n.tags, sourceCard.board, destinationBoardId),
                attachments: copyAttachments ? (n.attachments || []) : [],
                colorToken: n.colorToken,
                estimationTime: [],
                loggedTime: [],
                billedTime: [],
                order: n.order,
                createdBy: req.user.id,
                breadcrumbs: { project: destBoard.name, task: newCard.title, subtask: newSubtask.title }
              })));
              await SubtaskNano.insertMany(nanoDocs);
            }
          }

          // Update subtask stats
          const totalSubtasks = await Subtask.countDocuments({ task: newCard._id });
          const completedSubtasks = await Subtask.countDocuments({ task: newCard._id, status: { $in: ['done', 'closed'] } });
          const totalNanos = await SubtaskNano.countDocuments({ task: newCard._id });
          const completedNanos = await SubtaskNano.countDocuments({ task: newCard._id, status: { $in: ['done', 'closed'] } });
          
          await Card.findByIdAndUpdate(newCard._id, {
            subtaskStats: { total: totalSubtasks, completed: completedSubtasks, nanoTotal: totalNanos, nanoCompleted: completedNanos }
          });
        }
      }

      // 4. Log activity
      await Activity.create({
        type: 'card_copied',
        description: `Copied card "${sourceCard.title}" to "${destBoard.name}"`,
        user: req.user.id,
        board: destinationBoardId,
        card: newCard._id,
        list: destinationListId,
        contextType: 'task',
        metadata: {
          sourceCardId: sourceCard._id,
          sourceBoardId: sourceCard.board,
          destinationBoardId,
          destinationListId
        }
      });

      // 5. Emit socket events
      emitToBoard(destinationBoardId.toString(), 'task-copied', {
        card: populatedCard,
        listId: destinationListId,
        copiedBy: { id: req.user.id, name: req.user.name },
        sourceBoardId: sourceCard.board.toString()
      });

      // 6. Update recent destinations
      await updateRecentDestinations(req.user.id, {
        departmentId: destBoard.department,
        departmentName: (await Department.findById(destBoard.department).select('name').lean())?.name || '',
        projectId: destinationBoardId,
        projectName: destBoard.name,
        listId: destinationListId,
        listName: destList.title
      });

    } catch (bgError) {
      console.error('Error in copyCard background tasks:', bgError);
    }
  })();
});

// @desc    Move card across boards (cross-project move)
// @route   PUT /api/cards/:id/cross-move
// @access  Private (Admin/Manager)
export const crossMoveCard = asyncHandler(async (req, res, next) => {
  const { destinationBoardId, destinationListId, newPosition } = req.body;

  const card = await Card.findById(req.params.id)
    .populate('list', 'title')
    .populate('board', 'name department');

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const destBoard = await Board.findById(destinationBoardId).select('name department').lean();
  if (!destBoard) {
    return next(new ErrorResponse("Destination project not found", 404));
  }

  const destList = await List.findById(destinationListId);
  if (!destList) {
    return next(new ErrorResponse("Destination list not found", 404));
  }

  // Store original state for undo
  const originalState = {
    cardId: card._id.toString(),
    sourceBoardId: card.board._id.toString(),
    sourceListId: card.list._id.toString(),
    sourcePosition: card.position,
    sourceStatus: card.status,
    sourceLabels: card.labels?.map(l => l.toString()) || []
  };

  const sourceListId = card.list._id;
  const sourceListTitle = card.list.title;
  const sourceBoardId = card.board._id;
  const sourceBoardName = card.board.name;
  const oldPosition = card.position;

  // Decrement positions in source list
  await Card.updateMany(
    { list: sourceListId, position: { $gt: oldPosition }, isArchived: false },
    { $inc: { position: -1 } }
  );

  // Calculate destination position
  let destPosition = newPosition;
  if (destPosition === undefined || destPosition === null) {
    const maxPos = await Card.findOne({ list: destinationListId, isArchived: false })
      .sort({ position: -1 }).select('position').lean();
    destPosition = (maxPos?.position ?? -1) + 1;
  } else {
    // Make room at destination
    await Card.updateMany(
      { list: destinationListId, position: { $gte: destPosition }, isArchived: false },
      { $inc: { position: 1 } }
    );
  }

  // Re-map labels if cross-board
  const isCrossBoard = sourceBoardId.toString() !== destinationBoardId.toString();
  let newLabels = card.labels;
  if (isCrossBoard) {
    newLabels = await remapLabels(card.labels, sourceBoardId, destinationBoardId);
  }

  // Update the card
  card.board = destinationBoardId;
  card.list = destinationListId;
  card.position = destPosition;
  card.status = destList.title.toLowerCase().replace(/\s+/g, '-');
  card.labels = newLabels;
  await card.save();

  // Update child entities if cross-board
  if (isCrossBoard) {
    await Promise.all([
      Subtask.updateMany({ task: card._id }, { board: destinationBoardId }),
      SubtaskNano.updateMany({ task: card._id }, { board: destinationBoardId }),
      Attachment.updateMany(
        { card: card._id, isDeleted: false },
        { board: destinationBoardId, departmentId: destBoard.department }
      )
    ]);
  }

  // Generate undo token
  const undoToken = new mongoose.Types.ObjectId().toString();
  undoTokenStore.set(undoToken, originalState);
  // Auto-expire after 10 seconds
  setTimeout(() => undoTokenStore.delete(undoToken), 10000);

  // Send response immediately
  res.status(200).json({
    success: true,
    data: card,
    undoToken,
    message: 'Task moved successfully'
  });

  // ===== Background async processing =====
  (async () => {
    try {
      // 1. Log activity
      await Activity.create({
        type: 'card_moved',
        description: `Moved card "${card.title}" from "${sourceBoardName}" to "${destBoard.name}"`,
        user: req.user.id,
        board: destinationBoardId,
        card: card._id,
        list: destinationListId,
        contextType: 'task',
        metadata: {
          sourceBoardId: sourceBoardId.toString(),
          sourceListId: sourceListId.toString(),
          sourceListTitle,
          destinationBoardId: destinationBoardId.toString(),
          destinationListId: destinationListId.toString(),
          destinationListTitle: destList.title,
          crossBoard: isCrossBoard
        }
      });

      // 2. Emit socket events to BOTH boards
      const movePayload = {
        cardId: card._id,
        card: card.toObject(),
        sourceBoardId: sourceBoardId.toString(),
        sourceListId: sourceListId.toString(),
        destinationBoardId: destinationBoardId.toString(),
        destinationListId: destinationListId.toString(),
        newPosition: destPosition,
        status: card.status,
        movedBy: { id: req.user.id, name: req.user.name }
      };

      // Emit to source board (card removed)
      emitToBoard(sourceBoardId.toString(), 'task-moved-cross', movePayload);
      // Emit to destination board (card added) — only if different board
      if (isCrossBoard) {
        emitToBoard(destinationBoardId.toString(), 'task-moved-cross', movePayload);
      }

      // 3. Update recent destinations
      await updateRecentDestinations(req.user.id, {
        departmentId: destBoard.department,
        departmentName: (await Department.findById(destBoard.department).select('name').lean())?.name || '',
        projectId: destinationBoardId,
        projectName: destBoard.name,
        listId: destinationListId,
        listName: destList.title
      });

      // 4. Send notifications
      await notificationService.notifyTaskUpdated(card, req.user.id, {
        moved: true,
        fromList: sourceListTitle,
        toList: destList.title,
        crossBoard: isCrossBoard,
        fromBoard: sourceBoardName,
        toBoard: destBoard.name
      });

    } catch (bgError) {
      console.error('Error in crossMoveCard background tasks:', bgError);
    }
  })();
});

// @desc    Undo a move operation
// @route   POST /api/cards/:id/undo-move
// @access  Private
export const undoMove = asyncHandler(async (req, res, next) => {
  const { undoToken } = req.body;
  const cardId = req.params.id;

  if (!undoToken) {
    return next(new ErrorResponse("Undo token is required", 400));
  }

  const originalState = undoTokenStore.get(undoToken);
  if (!originalState) {
    return next(new ErrorResponse("Undo window has expired", 410));
  }

  // Consume the token
  undoTokenStore.delete(undoToken);

  if (originalState.cardId !== cardId) {
    return next(new ErrorResponse("Token does not match this card", 400));
  }

  const card = await Card.findById(cardId);
  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const currentListId = card.list;
  const currentBoardId = card.board;
  const currentPosition = card.position;

  // Decrement positions in current list
  await Card.updateMany(
    { list: currentListId, position: { $gt: currentPosition }, isArchived: false },
    { $inc: { position: -1 } }
  );

  // Make room in original list
  await Card.updateMany(
    { list: originalState.sourceListId, position: { $gte: originalState.sourcePosition }, isArchived: false },
    { $inc: { position: 1 } }
  );

  const isCrossBoard = currentBoardId.toString() !== originalState.sourceBoardId;

  // Restore labels if cross-board
  let restoredLabels = card.labels;
  if (isCrossBoard) {
    restoredLabels = await remapLabels(card.labels, currentBoardId, originalState.sourceBoardId);
  }

  // Restore card
  card.board = originalState.sourceBoardId;
  card.list = originalState.sourceListId;
  card.position = originalState.sourcePosition;
  card.status = originalState.sourceStatus;
  card.labels = restoredLabels;
  await card.save();

  // Restore child entities if cross-board
  if (isCrossBoard) {
    await Promise.all([
      Subtask.updateMany({ task: card._id }, { board: originalState.sourceBoardId }),
      SubtaskNano.updateMany({ task: card._id }, { board: originalState.sourceBoardId }),
      Attachment.updateMany({ card: card._id, isDeleted: false }, { board: originalState.sourceBoardId })
    ]);
  }

  // Emit socket events to both boards for real-time sync
  const undoPayload = {
    cardId: card._id,
    card: card.toObject(),
    sourceBoardId: currentBoardId.toString(),
    sourceListId: currentListId.toString(),
    destinationBoardId: originalState.sourceBoardId,
    destinationListId: originalState.sourceListId,
    newPosition: originalState.sourcePosition,
    status: originalState.sourceStatus,
    movedBy: { id: req.user.id, name: req.user.name },
    isUndo: true
  };

  emitToBoard(currentBoardId.toString(), 'task-moved-cross', undoPayload);
  if (isCrossBoard) {
    emitToBoard(originalState.sourceBoardId, 'task-moved-cross', undoPayload);
  }

  res.status(200).json({
    success: true,
    data: card,
    message: 'Move undone successfully'
  });
});

// @desc    Get copy/move destination options — departments
// @route   GET /api/cards/copy-move/departments
// @access  Private
export const getCopyMoveDepartments = asyncHandler(async (req, res) => {
  const user = req.user;
  let query = { isActive: true };

  // Non-admin/manager: only departments they belong to
  if (user.role !== 'admin' && user.role !== 'manager') {
    query.$or = [{ members: user._id }, { managers: user._id }];
  }

  const departments = await Department.find(query).select('name').sort({ name: 1 }).lean();

  res.status(200).json({ success: true, data: departments });
});

// @desc    Get copy/move destination options — projects by department
// @route   GET /api/cards/copy-move/projects/:departmentId
// @access  Private
export const getCopyMoveProjects = asyncHandler(async (req, res) => {
  const { departmentId } = req.params;

  const boards = await Board.find({
    department: departmentId,
    isArchived: { $ne: true },
    isDeleted: { $ne: true }
  }).select('name').sort({ name: 1 }).lean();

  res.status(200).json({ success: true, data: boards });
});

// @desc    Get copy/move destination options — lists by project
// @route   GET /api/cards/copy-move/lists/:boardId
// @access  Private
export const getCopyMoveLists = asyncHandler(async (req, res) => {
  const { boardId } = req.params;

  const lists = await List.find({
    board: boardId,
    isArchived: { $ne: true }
  }).select('title position').sort({ position: 1 }).lean();

  res.status(200).json({ success: true, data: lists });
});

// @desc    Get user's recent copy/move destinations
// @route   GET /api/cards/copy-move/recent
// @access  Private
export const getRecentDestinations = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('recentCopyMoveDestinations').lean();

  res.status(200).json({
    success: true,
    data: user?.recentCopyMoveDestinations || []
  });
});

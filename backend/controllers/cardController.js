import Card from "../models/Card.js";
import List from "../models/List.js";
import Board from "../models/Board.js";
import Department from "../models/Department.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import RecurringTask from "../models/RecurringTask.js";
import VersionHistory from "../models/VersionHistory.js";
import mongoose from "mongoose";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { emitToBoard, emitNotification } from "../server.js";
import { invalidateCache } from "../middleware/cache.js";
import notificationService from "../utils/notificationService.js";
import { invalidateHierarchyCache } from "../utils/cacheInvalidation.js";

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
    // Add computed fields
    {
      $addFields: {
        createdBy: { $arrayElemAt: ['$createdByArr', 0] },
        list: { $arrayElemAt: ['$listArr', 0] },
        board: { $arrayElemAt: ['$boardArr', 0] },
        hasRecurrence: { $gt: [{ $size: '$recurrence' }, 0] },
        coverImage: { $arrayElemAt: ['$coverImageArr', 0] }
      }
    },
    // Clean up temporary fields
    { $project: { createdByArr: 0, listArr: 0, boardArr: 0, recurrence: 0, coverImageArr: 0 } }
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
    members,
    labels,
    priority,
    dueDate,
    startDate,
    position,
  } = req.body;

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
    assignee,
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

  // Invalidate relevant caches
  invalidateHierarchyCache({ boardId: board, listId: list, cardId: card._id });
  invalidateCache("/api/analytics/dashboard");
  invalidateCache(`/api/analytics/department/`);

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
  await notificationService.notifyTaskAssigned(card, assignee, req.user.id);

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
    .populate("createdBy", "name email avatar");

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

  const oldAssignees = card.assignees?.map(a => a.toString()) || [];
  const oldDueDate = card.dueDate;
  const oldStatus = card.status;

  // Handle time tracking updates
  if (req.body.estimationTime) {
    req.body.estimationTime.forEach(entry => {
      if (!entry._id) { // Only for new entries
        if (!entry.user) {
          entry.user = req.user.id;
        }
        if (!entry.reason) {
          return next(new ErrorResponse("Reason is required for new estimation entries", 400));
        }
      }
    });
  }

  if (req.body.loggedTime) {
    req.body.loggedTime.forEach(entry => {
      if (!entry._id) { // Only for new entries
        if (!entry.user) {
          entry.user = req.user.id;
        }
        if (!entry.description) {
          return next(new ErrorResponse("Description is required for new logged time entries", 400));
        }
      }
    });
  }

  if (req.body.billedTime) {
    req.body.billedTime.forEach(entry => {
      if (!entry._id) { // Only for new entries
        if (!entry.user) {
          entry.user = req.user.id;
        }
        if (!entry.description) {
          return next(new ErrorResponse("Description is required for new billed time entries", 400));
        }
      }
    });
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
    .populate("billedTime.user", "name email avatar");

  // Log specific activity types based on what changed
  if (req.body.title && req.body.title !== card.title) {
    await Activity.create({
      type: "title_changed",
      description: `Changed title from "${card.title}" to "${req.body.title}"`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldTitle: card.title,
        newTitle: req.body.title
      }
    });
  }

  if (req.body.description !== undefined && req.body.description !== card.description) {
    // Save version history for description (content is required, use stripped htmlContent or placeholder)
    const descriptionContent = card.description 
      ? card.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() 
      : '';
    
    await VersionHistory.createVersion({
      entityType: 'card_description',
      entityId: card._id,
      content: descriptionContent || '(empty)',
      htmlContent: card.description || '',
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

  if (req.body.status && req.body.status !== card.status) {
    await Activity.create({
      type: "status_changed",
      description: `Changed status from "${card.status}" to "${req.body.status}"`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldStatus: card.status,
        newStatus: req.body.status
      }
    });
  }

  if (req.body.priority && req.body.priority !== card.priority) {
    await Activity.create({
      type: "priority_changed",
      description: `Changed priority from "${card.priority || 'None'}" to "${req.body.priority}"`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldPriority: card.priority || 'None',
        newPriority: req.body.priority
      }
    });
  }

  if (req.body.dueDate && req.body.dueDate !== card.dueDate) {
    await Activity.create({
      type: "due_date_changed",
      description: `Changed due date to ${new Date(req.body.dueDate).toLocaleDateString()}`,
      user: req.user.id,
      board: card.board,
      card: card._id,
      contextType: 'task',
      metadata: {
        oldDate: card.dueDate,
        newDate: req.body.dueDate
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
      }
    }
  }

  // General activity log
  await Activity.create({
    type: "card_updated",
    description: `Updated card "${card.title}"`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    contextType: 'task',
    metadata: {
      changes: req.body
    }
  });

  // Invalidate caches for hierarchy
  invalidateHierarchyCache({
    boardId: card.board,
    listId: card.list,
    cardId: card._id
  });
  if (originalListId && originalListId.toString() !== card.list.toString()) {
    invalidateHierarchyCache({
      boardId: originalBoardId,
      listId: originalListId
    });
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

  // Notify if assignees changed (only if actually changed)
  if (req.body.assignees !== undefined) {
    const newAssignees = req.body.assignees || [];
    const addedAssignees = newAssignees.filter(id => !oldAssignees.includes(id.toString()));
    const removedAssignees = oldAssignees.filter(id => !newAssignees.includes(id));

    if (addedAssignees.length > 0) {
      await notificationService.notifyTaskAssigned(card, addedAssignees, req.user.id);
      await Activity.create({
        type: 'member_added',
        description: `added members to the card`,
        user: req.user.id,
        board: card.board,
        card: card._id,
        contextType: 'task',
      });
    }

    if (removedAssignees.length > 0) {
      await Activity.create({
        type: 'member_removed',
        description: `removed members from the card`,
        user: req.user.id,
        board: card.board,
        card: card._id,
        contextType: 'task',
      });
    }
  }

  // Notify if due date changed (only if actually changed)
  if (req.body.dueDate !== undefined && req.body.dueDate !== oldDueDate && card.assignees && card.assignees.length > 0) {
    await notificationService.notifyTaskUpdated(card, req.user.id, { dueDate: req.body.dueDate });
  }

  // Notify if status changed to done (only if actually changed)
  if (req.body.status !== undefined && req.body.status === 'done' && oldStatus !== 'done' && card.assignees && card.assignees.length > 0) {
    await notificationService.notifyTaskUpdated(card, req.user.id, { status: 'done' });
  }

  // Invalidate cache for the board
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${card.board.department}/members-with-assignments`);
  invalidateCache("/api/analytics/dashboard");
  invalidateCache(`/api/analytics/department/`);

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

      // Invalidate caches
      invalidateHierarchyCache({
        boardId: card.board,
        listId: destinationListId,
        cardId: card._id
      });
      invalidateHierarchyCache({
        boardId: card.board,
        listId: sourceListId
      });
      invalidateCache("/api/departments");
      invalidateCache(`/api/departments/${card.board.department}/members-with-assignments`);
      invalidateCache("/api/analytics/dashboard");
      invalidateCache(`/api/analytics/department/`);
      
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
  const card = await Card.findById(req.params.id);

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const boardId = card.board;

  // Send notifications before deletion
  await notificationService.notifyTaskDeleted(card, req.user.id);

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

  await card.deleteOne();

  // Invalidate caches after deletion
  invalidateHierarchyCache({
    boardId: boardId,
    listId: card.list,
    cardId: card._id
  });
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${card.board?.department}/members-with-assignments`);
  invalidateCache("/api/analytics/dashboard");
  invalidateCache(`/api/analytics/department/`);

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
  const card = await Card.findById(id);
  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  // Get all activities for this card
  const activities = await Activity.find({ card: id, contextType: 'task' })
    .populate("user", "name email avatar")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

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

  // Invalidate caches
  invalidateHierarchyCache({
    boardId: card.board,
    listId: card.list,
    cardId: card._id
  });
  // CRITICAL: Invalidate workflow cache so archived card doesn't reappear on refresh
  invalidateCache(`/api/boards/${card.board}/workflow-complete`);
  invalidateCache(`/api/cards/board/${card.board}`);
  invalidateCache(`/api/cards/list/${card.list}`);
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${card.board?.department}/members-with-assignments`);
  invalidateCache("/api/analytics/dashboard");

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
  }).sort({ position: -1 });
  
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

  // Invalidate caches
  invalidateHierarchyCache({
    boardId: card.board,
    listId: card.list,
    cardId: card._id
  });
  // CRITICAL: Invalidate workflow cache so restored card appears on refresh
  invalidateCache(`/api/boards/${card.board}/workflow-complete`);
  invalidateCache(`/api/cards/board/${card.board}`);
  invalidateCache(`/api/cards/list/${card.list}`);
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${card.board?.department}/members-with-assignments`);
  invalidateCache("/api/analytics/dashboard");

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

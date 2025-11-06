import Card from "../models/Card.js";
import List from "../models/List.js";
import Board from "../models/Board.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import mongoose from "mongoose";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { emitToBoard, emitNotification } from "../server.js";
import { invalidateCache } from "../middleware/cache.js";

// @desc    Get all cards for a list
// @route   GET /api/cards/list/:listId
// @access  Private
export const getCards = asyncHandler(async (req, res, next) => {
  const { listId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { position: 1 },
    populate: [
      { path: "assignees", select: "name email avatar" },
      { path: "members", select: "name email avatar" },
      { path: "createdBy", select: "name email avatar" }
    ]
  };

  const result = await Card.paginate({ list: listId }, options);

  res.status(200).json({
    success: true,
    count: result.totalDocs,
    pagination: {
      currentPage: result.page,
      totalPages: result.totalPages,
      hasNext: result.hasNextPage,
      hasPrev: result.hasPrevPage
    },
    data: result.docs,
  });
});

// @desc    Get all cards for a board
// @route   GET /api/cards/board/:boardId
// @access  Private
export const getCardsByBoard = asyncHandler(async (req, res, next) => {
  const { boardId } = req.params;
  const { page = 1, limit = 100 } = req.query;

  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { position: 1 },
    populate: [
      { path: "assignees", select: "name email avatar" },
      { path: "members", select: "name email avatar" },
      { path: "createdBy", select: "name email avatar" },
      { path: "list", select: "title" }
    ]
  };

  const result = await Card.paginate({ board: boardId }, options);

  res.status(200).json({
    success: true,
    count: result.totalDocs,
    pagination: {
      currentPage: result.page,
      totalPages: result.totalPages,
      hasNext: result.hasNextPage,
      hasPrev: result.hasPrevPage
    },
    data: result.docs,
  });
});

// @desc    Get all cards for a department
// @route   GET /api/cards/department/:departmentId
// @access  Private
export const getCardsByDepartment = asyncHandler(async (req, res, next) => {
  const { departmentId } = req.params;
  const { page = 1, limit = 200 } = req.query;

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
        'boardInfo.department': new mongoose.Types.ObjectId(departmentId)
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
        board: { name: 1 },
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
      $match: {
        'boardInfo.department': new mongoose.Types.ObjectId(departmentId)
      }
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
  const card = await Card.findById(req.params.id)
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .populate("list", "title")
    .populate("board", "name");

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  res.status(200).json({
    success: true,
    data: card,
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
  } = req.body;

  const card = await Card.create({
    title,
    description,
    list,
    board,
    assignee,
    members: members || [],
    labels: labels || [],
    priority: priority || "medium",
    dueDate,
    startDate,
    position: await Card.countDocuments({ list }),
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
  });

  // Invalidate relevant caches
  invalidateCache(`/api/cards/list/${list}`);
  invalidateCache(`/api/cards/board/${board}`);
  
  // Emit real-time update to board
  emitToBoard(board, 'card-created', {
    card,
    listId: list,
    createdBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

  // Notify assignee if different from creator
  if (assignee && assignee.toString() !== req.user.id) {
    const notification = await Notification.create({
      type: "task_assigned",
      title: "New Task Assigned",
      message: `${req.user.name} assigned you to "${title}"`,
      user: assignee,
      sender: req.user.id,
      relatedCard: card._id,
      relatedBoard: board,
    });

    // Send real-time notification
    emitNotification(assignee.toString(), notification);
  }

  // Notify all members
  if (members && members.length > 0) {
    for (const memberId of members) {
      if (memberId.toString() !== req.user.id && memberId.toString() !== assignee?.toString()) {
        const notification = await Notification.create({
          type: "member_added",
          title: "Added to Task",
          message: `${req.user.name} added you to "${title}"`,
          user: memberId,
          sender: req.user.id,
          relatedCard: card._id,
          relatedBoard: board,
        });

        emitNotification(memberId.toString(), notification);
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

  card = await Card.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  })
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .populate("estimationTime.user", "name email avatar")
    .populate("loggedTime.user", "name email avatar");

  // Log activity
  await Activity.create({
    type: "card_updated",
    description: `Updated card "${card.title}"`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    metadata: {
      changes: req.body
    }
  });

  // Invalidate caches for both old and new lists
  if (req.body.list && req.body.list !== card.list) {
    invalidateCache(`/api/cards/list/${card.list}`);
    invalidateCache(`/api/cards/list/${req.body.list}`);
  }
  
  // Invalidate board cache
  invalidateCache(`/api/cards/board/${card.board}`);
  
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
    try {
      const text = req.body.description || '';
      const mentionRegex = /data-id=[\"']([^\"']+)[\"']/g;
      const mentionIds = new Set();
      const mentionObjects = [];
      let m;
      while ((m = mentionRegex.exec(text)) !== null) {
        if (m[1]) {
          mentionIds.add(m[1]);
          mentionObjects.push({ userId: m[1], name: '', notified: false });
        }
      }

      // Persist mention objects on card for later use
      try {
        if (mentionObjects.length > 0) {
          card.descriptionMentions = mentionObjects;
          await card.save();
        }
      } catch (err) {
        console.error('Error saving description mentions on card:', err);
      }

      for (const mentionedId of mentionIds) {
        if (mentionedId === req.user.id) continue;
        const notification = await Notification.create({
          type: 'mentioned',
          title: 'You were mentioned',
          message: `${req.user.name || 'Someone'} mentioned you in the description of "${card.title}"`,
          user: mentionedId,
          sender: req.user.id,
          relatedCard: card._id,
          relatedBoard: card.board,
        });

        emitNotification(mentionedId.toString(), notification);
      }
    } catch (err) {
      console.error('Error processing mentions in card description:', err);
    }
  }

  // Notify if assignees changed (only if actually changed)
  if (req.body.assignees !== undefined) {
    const newAssignees = req.body.assignees || [];
    const addedAssignees = newAssignees.filter(id => !oldAssignees.includes(id.toString()));
    const removedAssignees = oldAssignees.filter(id => !newAssignees.map(a => a.toString()).includes(id));

    // Notify added assignees
    for (const assigneeId of addedAssignees) {
      if (assigneeId.toString() !== req.user.id) {
        const notification = await Notification.create({
          type: "task_assigned",
          title: "Task Assigned",
          message: `${req.user.name} assigned you to "${card.title}"`,
          user: assigneeId,
          sender: req.user.id,
          relatedCard: card._id,
          relatedBoard: card.board,
        });

        emitNotification(assigneeId.toString(), notification);
      }
    }

    // Notify removed assignees if needed (optional)
    // For now, we'll skip notifications for removals to avoid spam
  }

  // Notify if due date changed (only if actually changed)
  if (req.body.dueDate !== undefined && req.body.dueDate !== oldDueDate && card.assignees && card.assignees.length > 0) {
    for (const assignee of card.assignees) {
      const notification = await Notification.create({
        type: "task_updated",
        title: "Due Date Changed",
        message: `Due date for "${card.title}" has been updated to ${new Date(req.body.dueDate).toLocaleDateString()}`,
        user: assignee._id,
        sender: req.user.id,
        relatedCard: card._id,
        relatedBoard: card.board,
      });

      emitNotification(assignee._id.toString(), notification);
    }
  }

  // Notify if status changed to done (only if actually changed)
  if (req.body.status !== undefined && req.body.status === 'done' && oldStatus !== 'done' && card.assignees && card.assignees.length > 0) {
    for (const assignee of card.assignees) {
      const notification = await Notification.create({
        type: "task_updated",
        title: "Task Completed",
        message: `"${card.title}" has been marked as complete`,
        user: assignee._id,
        sender: req.user.id,
        relatedCard: card._id,
        relatedBoard: card.board,
      });

      emitNotification(assignee._id.toString(), notification);
    }
  }

  // Invalidate cache for the board
  invalidateCache(`/api/boards/${card.board.toString()}`);
  invalidateCache("/api/departments");
  invalidateCache("/api/analytics/dashboard");

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

  // Log activity
  await Activity.create({
    type: "card_moved",
    description: `Moved card "${card.title}"`,
    user: req.user.id,
    board: card.board,
    card: card._id,
    list: card.list,
    metadata: {
      sourceListId,
      destinationListId,
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

  // Invalidate all related caches
  invalidateCache(`/api/boards/${card.board.toString()}`);
  invalidateCache(`/api/cards/list/${sourceListId}`);
  invalidateCache(`/api/cards/list/${destinationListId}`);
  invalidateCache(`/api/cards/board/${card.board.toString()}`);
  invalidateCache(`/api/cards/${card._id}`);
  invalidateCache("/api/departments");

  res.status(200).json({
    success: true,
    data: card,
  });
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

  res.status(200).json({
    success: true,
    message: "Card deleted successfully",
  });
});

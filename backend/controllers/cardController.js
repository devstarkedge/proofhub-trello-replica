import Card from "../models/Card.js";
import List from "../models/List.js";
import Board from "../models/Board.js";
import Activity from "../models/Activity.js";
import Notification from "../models/Notification.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { emitToBoard, emitNotification } from "../server.js";

// @desc    Get all cards for a list
// @route   GET /api/cards/list/:listId
// @access  Private
export const getCards = asyncHandler(async (req, res, next) => {
  const { listId } = req.params;

  const cards = await Card.find({ list: listId })
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .sort("position");

  res.status(200).json({
    success: true,
    count: cards.length,
    data: cards,
  });
});

// @desc    Get all cards for a board
// @route   GET /api/cards/board/:boardId
// @access  Private
export const getCardsByBoard = asyncHandler(async (req, res, next) => {
  const { boardId } = req.params;

  const cards = await Card.find({ board: boardId })
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .populate("list", "title")
    .sort("position");

  res.status(200).json({
    success: true,
    count: cards.length,
    data: cards,
  });
});

// @desc    Get all cards for a department
// @route   GET /api/cards/department/:departmentId
// @access  Private
export const getCardsByDepartment = asyncHandler(async (req, res, next) => {
  const { departmentId } = req.params;

  // Find all boards in the department
  const boards = await Board.find({ department: departmentId });
  const boardIds = boards.map(board => board._id);

  // Find all cards in those boards
  const cards = await Card.find({ board: { $in: boardIds } })
    .populate("assignees", "name email avatar")
    .populate("members", "name email avatar")
    .populate("createdBy", "name email avatar")
    .populate("list", "title")
    .populate("board", "name")
    .sort("-updatedAt");

  res.status(200).json({
    success: true,
    count: cards.length,
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

  // Emit real-time update
  emitToBoard(card.board.toString(), 'card-updated', {
    cardId: card._id,
    updates: req.body,
    updatedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

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
  const card = await Card.findById(req.params.id);

  if (!card) {
    return next(new ErrorResponse("Card not found", 404));
  }

  const sourceListId = card.list;
  const oldPosition = card.position;

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

    // Update status based on list title
    const destList = await List.findById(destinationListId);
    const listTitle = destList.title.toLowerCase();

    // Dynamic status mapping based on list title keywords
    if (listTitle.includes("done") || listTitle.includes("completed") || listTitle.includes("finished")) {
      card.status = "done";
    } else if (listTitle.includes("review") || listTitle.includes("testing") || listTitle.includes("qa")) {
      card.status = "review";
    } else if (listTitle.includes("progress") || listTitle.includes("doing") || listTitle.includes("working") || listTitle.includes("in progress")) {
      card.status = "in-progress";
    } else if (listTitle.includes("todo") || listTitle.includes("backlog") || listTitle.includes("to do")) {
      card.status = "todo";
    } else {
      // For custom list names, set status to the list title (normalized)
      card.status = destList.title.toLowerCase().replace(/\s+/g, '-');
    }
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

  // Emit real-time update
  emitToBoard(card.board.toString(), 'card-moved', {
    cardId: card._id,
    sourceListId,
    destinationListId,
    newPosition,
    movedBy: {
      id: req.user.id,
      name: req.user.name
    }
  });

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

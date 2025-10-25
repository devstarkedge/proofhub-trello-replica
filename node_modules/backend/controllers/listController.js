import List from '../models/List.js';
import Card from '../models/Card.js';
import Board from '../models/Board.js';
import Activity from '../models/Activity.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// @desc    Get lists for board
// @route   GET /api/lists/board/:boardId
// @access  Private
export const getLists = asyncHandler(async (req, res, next) => {
  const lists = await List.find({ 
    board: req.params.boardId,
    isArchived: false
  }).sort('position');

  res.status(200).json({
    success: true,
    count: lists.length,
    data: lists
  });
});

// @desc    Create list
// @route   POST /api/lists
// @access  Private
export const createList = asyncHandler(async (req, res, next) => {
  const { title, board, position, color } = req.body;

  // Verify board access
  const boardDoc = await Board.findById(board);
  if (!boardDoc) {
    return next(new ErrorResponse('Board not found', 404));
  }

  const list = await List.create({
    title,
    board,
    position: position !== undefined ? position : await List.countDocuments({ board }),
    color
  });

  // Log activity
  await Activity.create({
    type: 'list_created',
    description: `Created list "${title}"`,
    user: req.user.id,
    board,
    list: list._id
  });

  res.status(201).json({
    success: true,
    data: list
  });
});

// @desc    Update list
// @route   PUT /api/lists/:id
// @access  Private
export const updateList = asyncHandler(async (req, res, next) => {
  const list = await List.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!list) {
    return next(new ErrorResponse('List not found', 404));
  }

  // Log activity
  await Activity.create({
    type: 'list_updated',
    description: `Updated list "${list.title}"`,
    user: req.user.id,
    board: list.board,
    list: list._id
  });

  res.status(200).json({
    success: true,
    data: list
  });
});

// @desc    Update list position
// @route   PUT /api/lists/:id/position
// @access  Private
export const updateListPosition = asyncHandler(async (req, res, next) => {
  const { newPosition } = req.body;
  const list = await List.findById(req.params.id);

  if (!list) {
    return next(new ErrorResponse('List not found', 404));
  }

  const oldPosition = list.position;

  if (newPosition === oldPosition) {
    return res.status(200).json({ success: true, data: list });
  }

  // Update positions of other lists
  if (newPosition > oldPosition) {
    await List.updateMany(
      {
        board: list.board,
        position: { $gt: oldPosition, $lte: newPosition }
      },
      { $inc: { position: -1 } }
    );
  } else {
    await List.updateMany(
      {
        board: list.board,
        position: { $gte: newPosition, $lt: oldPosition }
      },
      { $inc: { position: 1 } }
    );
  }

  list.position = newPosition;
  await list.save();

  res.status(200).json({
    success: true,
    data: list
  });
});

// @desc    Delete list
// @route   DELETE /api/lists/:id
// @access  Private
export const deleteList = asyncHandler(async (req, res, next) => {
  const list = await List.findById(req.params.id);

  if (!list) {
    return next(new ErrorResponse('List not found', 404));
  }

  // Delete all cards in the list
  await Card.deleteMany({ list: list._id });

  await list.deleteOne();

  res.status(200).json({
    success: true,
    message: 'List deleted successfully'
  });
});

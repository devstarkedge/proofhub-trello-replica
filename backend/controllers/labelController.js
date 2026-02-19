import Label from '../models/Label.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { invalidateLabelCache } from '../utils/cacheInvalidation.js';

// @desc    Get all labels for a board/project
// @route   GET /api/labels/board/:boardId
// @access  Private
export const getLabelsByBoard = asyncHandler(async (req, res) => {
  const { boardId } = req.params;

  const labels = await Label.find({ board: boardId })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: labels
  });
});

// @desc    Create a new label for a board/project
// @route   POST /api/labels
// @access  Private
export const createLabel = asyncHandler(async (req, res) => {
  const { name, color, boardId } = req.body;

  if (!name || !boardId) {
    res.status(400);
    throw new Error('Label name and board ID are required');
  }

  // Check for duplicate label name in the same board
  const existingLabel = await Label.findOne({ 
    board: boardId, 
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
  });

  if (existingLabel) {
    res.status(400);
    throw new Error('A label with this name already exists in this project');
  }

  const label = await Label.create({
    name: name.trim(),
    color: color || '#3B82F6',
    board: boardId,
    createdBy: req.user._id
  });

  invalidateLabelCache(boardId);

  res.status(201).json({
    success: true,
    data: label
  });
});

// @desc    Update a label
// @route   PUT /api/labels/:id
// @access  Private
export const updateLabel = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body;

  const label = await Label.findById(id);

  if (!label) {
    res.status(404);
    throw new Error('Label not found');
  }

  // Check for duplicate name if name is being changed
  if (name && name.trim().toLowerCase() !== label.name.toLowerCase()) {
    const existingLabel = await Label.findOne({
      board: label.board,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: id }
    });

    if (existingLabel) {
      res.status(400);
      throw new Error('A label with this name already exists in this project');
    }
  }

  if (name) label.name = name.trim();
  if (color) label.color = color;

  await label.save();
  invalidateLabelCache(label.board);

  res.json({
    success: true,
    data: label
  });
});

// @desc    Delete a label
// @route   DELETE /api/labels/:id
// @access  Private
export const deleteLabel = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const label = await Label.findById(id);

  if (!label) {
    res.status(404);
    throw new Error('Label not found');
  }

  // Remove label from all cards, subtasks, and nano-subtasks
  await Promise.all([
    Card.updateMany(
      { labels: id },
      { $pull: { labels: id } }
    ),
    Subtask.updateMany(
      { tags: id },
      { $pull: { tags: id } }
    ),
    SubtaskNano.updateMany(
      { tags: id },
      { $pull: { tags: id } }
    )
  ]);

  await Label.findByIdAndDelete(id);

  invalidateLabelCache(label.board);

  res.json({
    success: true,
    message: 'Label deleted successfully'
  });
});

// @desc    Add labels to a card
// @route   POST /api/labels/card/:cardId
// @access  Private
export const addLabelsToCard = asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const { labelIds } = req.body;

  if (!Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Label IDs must be an array');
  }

  const card = await Card.findByIdAndUpdate(
    cardId,
    { $addToSet: { labels: { $each: labelIds } } },
    { new: true }
  ).populate('labels');

  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }

  res.json({
    success: true,
    data: card.labels
  });
});

// @desc    Remove labels from a card
// @route   DELETE /api/labels/card/:cardId
// @access  Private
export const removeLabelsFromCard = asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const { labelIds } = req.body;

  if (!Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Label IDs must be an array');
  }

  const card = await Card.findByIdAndUpdate(
    cardId,
    { $pull: { labels: { $in: labelIds } } },
    { new: true }
  ).populate('labels');

  if (!card) {
    res.status(404);
    throw new Error('Card not found');
  }

  res.json({
    success: true,
    data: card.labels
  });
});

// @desc    Add labels to a subtask
// @route   POST /api/labels/subtask/:subtaskId
// @access  Private
export const addLabelsToSubtask = asyncHandler(async (req, res) => {
  const { subtaskId } = req.params;
  const { labelIds } = req.body;

  if (!Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Label IDs must be an array');
  }

  const subtask = await Subtask.findByIdAndUpdate(
    subtaskId,
    { $addToSet: { tags: { $each: labelIds } } },
    { new: true }
  ).populate('tags');

  if (!subtask) {
    res.status(404);
    throw new Error('Subtask not found');
  }

  res.json({
    success: true,
    data: subtask.tags
  });
});

// @desc    Remove labels from a subtask
// @route   DELETE /api/labels/subtask/:subtaskId
// @access  Private
export const removeLabelsFromSubtask = asyncHandler(async (req, res) => {
  const { subtaskId } = req.params;
  const { labelIds } = req.body;

  if (!Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Label IDs must be an array');
  }

  const subtask = await Subtask.findByIdAndUpdate(
    subtaskId,
    { $pull: { tags: { $in: labelIds } } },
    { new: true }
  ).populate('tags');

  if (!subtask) {
    res.status(404);
    throw new Error('Subtask not found');
  }

  res.json({
    success: true,
    data: subtask.tags
  });
});

// @desc    Add labels to a nano-subtask
// @route   POST /api/labels/nano/:nanoId
// @access  Private
export const addLabelsToNano = asyncHandler(async (req, res) => {
  const { nanoId } = req.params;
  const { labelIds } = req.body;

  if (!Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Label IDs must be an array');
  }

  const nano = await SubtaskNano.findByIdAndUpdate(
    nanoId,
    { $addToSet: { tags: { $each: labelIds } } },
    { new: true }
  ).populate('tags');

  if (!nano) {
    res.status(404);
    throw new Error('Nano-subtask not found');
  }

  res.json({
    success: true,
    data: nano.tags
  });
});

// @desc    Remove labels from a nano-subtask
// @route   DELETE /api/labels/nano/:nanoId
// @access  Private
export const removeLabelsFromNano = asyncHandler(async (req, res) => {
  const { nanoId } = req.params;
  const { labelIds } = req.body;

  if (!Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Label IDs must be an array');
  }

  const nano = await SubtaskNano.findByIdAndUpdate(
    nanoId,
    { $pull: { tags: { $in: labelIds } } },
    { new: true }
  ).populate('tags');

  if (!nano) {
    res.status(404);
    throw new Error('Nano-subtask not found');
  }

  res.json({
    success: true,
    data: nano.tags
  });
});

// @desc    Sync labels - update card/subtask/nano labels in bulk
// @route   POST /api/labels/sync
// @access  Private
export const syncLabels = asyncHandler(async (req, res) => {
  const { entityType, entityId, labelIds } = req.body;

  if (!entityType || !entityId || !Array.isArray(labelIds)) {
    res.status(400);
    throw new Error('Entity type, entity ID, and label IDs are required');
  }

  let entity;
  const field = entityType === 'card' ? 'labels' : 'tags';

  switch (entityType) {
    case 'card':
      entity = await Card.findByIdAndUpdate(
        entityId,
        { labels: labelIds },
        { new: true }
      ).populate('labels');
      break;
    case 'subtask':
      entity = await Subtask.findByIdAndUpdate(
        entityId,
        { tags: labelIds },
        { new: true }
      ).populate('tags');
      break;
    case 'nano':
      entity = await SubtaskNano.findByIdAndUpdate(
        entityId,
        { tags: labelIds },
        { new: true }
      ).populate('tags');
      break;
    default:
      res.status(400);
      throw new Error('Invalid entity type');
  }

  if (!entity) {
    res.status(404);
    throw new Error('Entity not found');
  }

  res.json({
    success: true,
    data: entity[field]
  });
});

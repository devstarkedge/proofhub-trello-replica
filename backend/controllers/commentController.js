import Comment from '../models/Comment.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { emitNotification, emitToBoard } from '../server.js';
import { invalidateCache } from '../middleware/cache.js';
import notificationService from '../utils/notificationService.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

const getContextDetails = async ({ cardId, subtaskId, nanoId }) => {
  if (nanoId) {
    const nano = await SubtaskNano.findById(nanoId).populate('subtask task');
    if (!nano) throw new ErrorResponse('Subtask-Nano not found', 404);
    const subtask = await Subtask.findById(nano.subtask);
    return {
      cardId: nano.task._id.toString(),
      subtaskId: subtask?._id,
      nanoId,
      contextType: 'subtaskNano',
      contextRef: nanoId,
    };
  }

  if (subtaskId) {
    const subtask = await Subtask.findById(subtaskId);
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    return {
      cardId: subtask.task._id.toString(),
      subtaskId,
      contextType: 'subtask',
      contextRef: subtaskId,
    };
  }

  if (!cardId) {
    throw new ErrorResponse('Card context is required', 400);
  }

  return {
    cardId,
    subtaskId: null,
    nanoId: null,
    contextType: 'card',
    contextRef: cardId,
  };
};

export const createComment = asyncHandler(async (req, res) => {
  const { htmlContent, card, subtask, subtaskNano } = req.body;

  const { cardId, subtaskId, nanoId, contextType, contextRef } = await getContextDetails({
    cardId: card,
    subtaskId: subtask,
    nanoId: subtaskNano
  });

  const cardDoc = await Card.findById(cardId).populate('assignees', 'name');
  if (!cardDoc) {
    return res.status(404).json({ message: 'Card not found' });
  }

  // Create a plain-text excerpt for text field
  const plain = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  const comment = new Comment({
    text: plain || (req.body.text || ''),
    htmlContent: htmlContent || req.body.text || '',
    user: req.user.id,
    card: cardId,
    subtask: subtaskId,
    subtaskNano: nanoId,
    contextType,
    contextRef,
  });
  await comment.save();

  const populatedComment = await Comment.findById(comment._id).populate('user', 'name avatar');

  // Emit real-time comment added to board
  if (cardDoc.board) {
    emitToBoard(cardDoc.board.toString(), 'comment-added', {
      cardId: cardId,
      contextType,
      contextRef,
      comment: populatedComment
    });
  }

  // Send notifications using the notification service
  await notificationService.notifyCommentAdded(cardDoc, populatedComment, req.user.id);

  // Invalidate relevant caches
  invalidateCache(`/api/cards/${cardId}`);
  invalidateCache(`/api/cards/${cardId}/comments`);

  res.status(201).json(populatedComment);
});

export const getCommentsByCard = asyncHandler(async (req, res) => {
  const { cardId } = req.params;

  const comments = await Comment.find({ card: cardId, contextType: 'card' })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: comments.length,
    data: comments,
  });
});

export const getCommentsBySubtask = asyncHandler(async (req, res) => {
  const { subtaskId } = req.params;

  const comments = await Comment.find({ subtask: subtaskId, contextType: 'subtask' })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: comments.length,
    data: comments,
  });
});

export const getCommentsByNano = asyncHandler(async (req, res) => {
  const { nanoId } = req.params;

  const comments = await Comment.find({ subtaskNano: nanoId, contextType: 'subtaskNano' })
    .populate('user', 'name avatar')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: comments.length,
    data: comments,
  });
});

export const updateComment = asyncHandler(async (req, res) => {
  const { text, htmlContent } = req.body;

  const comment = await Comment.findById(req.params.id).populate('card');
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  if (comment.user.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  if (htmlContent) {
    comment.htmlContent = htmlContent;
    comment.text = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  } else if (text) {
    comment.text = text;
  }

  comment.isEdited = true;
  comment.editedAt = new Date();
  await comment.save();

  // Re-process mentions (notify new mentions)
  try {
    await notificationService.processMentions(comment.htmlContent || '', comment.card, req.user.id);
  } catch (err) {
    console.error('Error processing mentions on comment update:', err);
  }

  // Invalidate relevant caches
  invalidateCache(`/api/cards/${comment.card}`);
  invalidateCache(`/api/cards/${comment.card}/comments`);

  res.status(200).json({
    success: true,
    data: comment,
  });
});

export const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  if (comment.user.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  await Comment.findByIdAndDelete(req.params.id);
  await Card.findByIdAndUpdate(comment.card, { $pull: { comments: req.params.id } });

  // Invalidate relevant caches
  invalidateCache(`/api/cards/${comment.card}`);
  invalidateCache(`/api/cards/${comment.card}/comments`);

  res.status(200).json({
    success: true,
    message: 'Comment deleted successfully',
  });
});

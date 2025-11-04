import Comment from '../models/Comment.js';
import Card from '../models/Card.js';
import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { emitNotification, emitToBoard } from '../server.js';
import { invalidateCache } from '../middleware/cache.js';

export const createComment = asyncHandler(async (req, res) => {
  const { text, card } = req.body;

  const cardDoc = await Card.findById(card).populate('assignees', 'name');
  if (!cardDoc) {
    return res.status(404).json({ message: 'Card not found' });
  }

  const comment = new Comment({
    text,
    user: req.user.id,
    card: card,
  });
  await comment.save();

  const populatedComment = await Comment.findById(comment._id).populate('user', 'name avatar');

  // Emit real-time comment added to board
  if (cardDoc.board) {
    emitToBoard(cardDoc.board.toString(), 'comment-added', {
      cardId: card,
      comment: populatedComment
    });
  }

  // Notify assignees if different from commenter
  if (cardDoc.assignees && cardDoc.assignees.length > 0) {
    for (const assignee of cardDoc.assignees) {
      if (assignee._id.toString() !== req.user.id) {
        const notification = new Notification({
          type: 'comment_added',
          title: 'New Comment',
          message: `${req.user.name || 'Someone'} commented on "${cardDoc.title}"`,
          user: assignee._id,
          sender: req.user.id,
          relatedCard: card,
        });
        await notification.save();

        // Emit real-time notification
        emitNotification(assignee._id.toString(), notification);
      }
    }
  }

  // Invalidate relevant caches
  invalidateCache(`/api/cards/${card}`);
  invalidateCache(`/api/cards/${card}/comments`);

  res.status(201).json(populatedComment);
});

export const getCommentsByCard = asyncHandler(async (req, res) => {
  const { cardId } = req.params;

  const comments = await Comment.find({ card: cardId }).populate('user', 'name avatar').sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: comments.length,
    data: comments,
  });
});

export const updateComment = asyncHandler(async (req, res) => {
  const { text } = req.body;

  const comment = await Comment.findById(req.params.id);
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  if (comment.user.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  comment.text = text;
  await comment.save();

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

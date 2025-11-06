import Comment from '../models/Comment.js';
import Card from '../models/Card.js';
import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { emitNotification, emitToBoard } from '../server.js';
import { invalidateCache } from '../middleware/cache.js';

export const createComment = asyncHandler(async (req, res) => {
  // Expect htmlContent (rich HTML) and card id
  const { htmlContent, card } = req.body;

  const cardDoc = await Card.findById(card).populate('assignees', 'name');
  if (!cardDoc) {
    return res.status(404).json({ message: 'Card not found' });
  }

  // Create a plain-text excerpt for text field
  const plain = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  const comment = new Comment({
    text: plain || (req.body.text || ''),
    htmlContent: htmlContent || req.body.text || '',
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

  // Detect mentions in the comment HTML and notify mentioned users
  try {
    const mentionIds = new Set();
    const mentionRegex = /data-id=["']([^"']+)["']/g;
    let m;
    while ((m = mentionRegex.exec(htmlContent || '')) !== null) {
      if (m[1]) mentionIds.add(m[1]);
    }

    for (const mentionedId of mentionIds) {
      if (mentionedId === req.user.id) continue; // don't notify self
      const notification = new Notification({
        type: 'comment_mention',
        title: 'You were mentioned',
        message: `${req.user.name || 'Someone'} mentioned you in a comment on "${cardDoc.title}"`,
        user: mentionedId,
        sender: req.user.id,
        relatedCard: card,
      });
      await notification.save();
      emitNotification(mentionedId.toString(), notification);
    }
  } catch (err) {
    console.error('Error processing mentions:', err);
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
    const mentionRegex = /data-id=["']([^"']+)["']/g;
    const mentionIds = new Set();
    let m;
    while ((m = mentionRegex.exec(comment.htmlContent || '')) !== null) {
      if (m[1]) mentionIds.add(m[1]);
    }

    for (const mentionedId of mentionIds) {
      if (mentionedId === req.user.id) continue;
      const notification = new Notification({
        type: 'comment_mention',
        title: 'You were mentioned',
        message: `${req.user.name || 'Someone'} mentioned you in a comment`,
        user: mentionedId,
        sender: req.user.id,
        relatedCard: comment.card
      });
      await notification.save();
      emitNotification(mentionedId.toString(), notification);
    }
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

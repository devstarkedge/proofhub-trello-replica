import Comment from '../models/Comment.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Notification from '../models/Notification.js';
import Activity from '../models/Activity.js';
import VersionHistory from '../models/VersionHistory.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Team from '../models/Team.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { emitNotification, emitToBoard } from '../server.js';
import { invalidateCache } from '../middleware/cache.js';
import notificationService from '../utils/notificationService.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// Helper to get context details from card, subtask, or nano
const getContextDetails = async ({ cardId, subtaskId, nanoId }) => {
  if (nanoId) {
    const nano = await SubtaskNano.findById(nanoId).populate('subtask task');
    if (!nano) throw new ErrorResponse('Subtask-Nano not found', 404);
    const subtask = await Subtask.findById(nano.subtask);
    return {
      boardId: nano.board,
      cardId: nano.task._id.toString(),
      subtaskId: subtask?._id,
      nanoId,
      contextType: 'subtaskNano',
      contextRef: nanoId,
    };
  }

  if (subtaskId) {
    const subtask = await Subtask.findById(subtaskId).populate('board');
    if (!subtask) throw new ErrorResponse('Subtask not found', 404);
    return {
      boardId: subtask.board,
      cardId: subtask.task._id.toString(),
      subtaskId,
      contextType: 'subtask',
      contextRef: subtaskId,
    };
  }

  if (!cardId) {
    throw new ErrorResponse('Card context is required', 400);
  }
  const card = await Card.findById(cardId).populate('board');
  return {
    boardId: card.board,
    cardId,
    subtaskId: null,
    nanoId: null,
    contextType: 'card',
    contextRef: cardId,
  };
};

// Helper to check comment permissions
const checkCommentPermission = async (user, action) => {
  // Admin and manager always have full access
  if (user.role === 'admin' || user.role === 'manager') {
    return true;
  }
  
  // Check role-based permissions
  if (user.roleRef) {
    const role = await Role.findById(user.roleRef);
    if (role) {
      const permissionMap = {
        comment: role.permissions?.canComment ?? true,
        edit: role.permissions?.canEditComments ?? true,
        delete: role.permissions?.canDeleteComments ?? true,
        pin: role.permissions?.canPinComments ?? false,
        mention: role.permissions?.canMention ?? true,
      };
      return permissionMap[action] ?? true;
    }
  }
  
  // Default permissions for regular users
  const defaultPermissions = {
    comment: true,
    edit: true, // own comments only
    delete: true, // own comments only
    pin: false,
    mention: true,
  };
  return defaultPermissions[action] ?? true;
};

// ============================================================================
// CREATE COMMENT
// ============================================================================
export const createComment = asyncHandler(async (req, res) => {
  const { htmlContent, card, subtask, subtaskNano, attachments } = req.body;

  const { boardId, cardId, subtaskId, nanoId, contextType, contextRef } = await getContextDetails({
    cardId: card,
    subtaskId: subtask,
    nanoId: subtaskNano
  });

  const cardDoc = await Card.findById(cardId).populate('assignees', 'name').populate('board', 'name');
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
    attachments: attachments || [],
  });
  await comment.save();

  // Log activity
  await Activity.create({
    type: 'comment_added',
    description: `Added a new comment`,
    user: req.user.id,
    board: boardId,
    card: cardId,
    subtask: subtaskId,
    nanoSubtask: nanoId,
    contextType: contextType,
  });

  const populatedComment = await Comment.findById(comment._id)
    .populate('user', 'name avatar')
    .populate('pinnedBy', 'name');

  // Emit real-time comment added to board
  if (cardDoc.board) {
    emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-added', {
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
  invalidateCache(`/api/versions/comment/${comment._id}/count`);

  res.status(201).json(populatedComment);
});

// ============================================================================
// CREATE THREADED REPLY
// ============================================================================
export const createReply = asyncHandler(async (req, res) => {
  const { id: parentCommentId } = req.params;
  const { htmlContent, attachments } = req.body;

  // Find parent comment
  const parentComment = await Comment.findById(parentCommentId).populate('user', 'name');
  if (!parentComment) {
    return res.status(404).json({ message: 'Parent comment not found' });
  }

  // Check thread depth limit
  if (parentComment.threadDepth >= 3) {
    return res.status(400).json({ message: 'Maximum thread depth reached' });
  }

  const cardDoc = await Card.findById(parentComment.card).populate('board', 'name');
  if (!cardDoc) {
    return res.status(404).json({ message: 'Card not found' });
  }

  // Create reply
  const plain = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  const reply = new Comment({
    text: plain,
    htmlContent: htmlContent || '',
    user: req.user.id,
    card: parentComment.card,
    subtask: parentComment.subtask,
    subtaskNano: parentComment.subtaskNano,
    contextType: parentComment.contextType,
    contextRef: parentComment.contextRef,
    parentComment: parentCommentId,
    threadDepth: parentComment.threadDepth + 1,
    attachments: attachments || [],
  });
  await reply.save();

  // Increment parent's reply count
  await Comment.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } });

  const populatedReply = await Comment.findById(reply._id)
    .populate('user', 'name avatar');

  // Log activity
  await Activity.create({
    type: 'comment_added',
    description: `Replied to a comment`,
    user: req.user.id,
    board: cardDoc.board?._id || cardDoc.board,
    card: parentComment.card,
    subtask: parentComment.subtask,
    nanoSubtask: parentComment.subtaskNano,
    contextType: parentComment.contextType,
  });

  // Emit real-time reply added
  if (cardDoc.board) {
    emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-reply-added', {
      cardId: parentComment.card,
      parentCommentId,
      contextType: parentComment.contextType,
      contextRef: parentComment.contextRef,
      reply: populatedReply
    });
  }

  // Notify parent comment author
  if (parentComment.user._id.toString() !== req.user.id) {
    await notificationService.createNotification({
      type: 'comment_reply',
      title: 'New Reply',
      message: `${req.user.name} replied to your comment`,
      user: parentComment.user._id,
      sender: req.user.id,
      relatedCard: parentComment.card,
      relatedBoard: cardDoc.board?._id || cardDoc.board,
      entityId: reply._id,
      entityType: 'Comment',
      deepLink: {
        commentId: reply._id,
        contextType: parentComment.contextType,
        contextRef: parentComment.contextRef,
        threadParentId: parentCommentId,
      }
    });
  }

  // Invalidate caches
  invalidateCache(`/api/cards/${parentComment.card}`);
  invalidateCache(`/api/cards/${parentComment.card}/comments`);

  res.status(201).json(populatedReply);
});

// ============================================================================
// GET REPLIES FOR A COMMENT
// ============================================================================
export const getReplies = asyncHandler(async (req, res) => {
  const { id: parentCommentId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const result = await Comment.getReplies(parentCommentId, {
    page: parseInt(page),
    limit: parseInt(limit)
  });

  res.status(200).json({
    success: true,
    ...result
  });
});

// ============================================================================
// GET PAGINATED COMMENTS
// ============================================================================
export const getCommentsByCard = asyncHandler(async (req, res) => {
  const { cardId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const result = await Comment.getPaginatedComments(
    { card: cardId, contextType: 'card' },
    { page: parseInt(page), limit: parseInt(limit) }
  );

  res.status(200).json({
    success: true,
    count: result.comments.length,
    data: result.comments,
    pagination: result.pagination,
  });
});

export const getCommentsBySubtask = asyncHandler(async (req, res) => {
  const { subtaskId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const result = await Comment.getPaginatedComments(
    { subtask: subtaskId, contextType: 'subtask' },
    { page: parseInt(page), limit: parseInt(limit) }
  );

  res.status(200).json({
    success: true,
    count: result.comments.length,
    data: result.comments,
    pagination: result.pagination,
  });
});

export const getCommentsByNano = asyncHandler(async (req, res) => {
  const { nanoId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const result = await Comment.getPaginatedComments(
    { subtaskNano: nanoId, contextType: 'subtaskNano' },
    { page: parseInt(page), limit: parseInt(limit) }
  );

  res.status(200).json({
    success: true,
    count: result.comments.length,
    data: result.comments,
    pagination: result.pagination,
  });
});

// ============================================================================
// ADD REACTION
// ============================================================================
export const addReaction = asyncHandler(async (req, res) => {
  const { id: commentId } = req.params;
  const { emoji } = req.body;

  const validEmojis = ['👍', '❤️', '😂', '🚀', '😮', '😢'];
  if (!validEmojis.includes(emoji)) {
    return res.status(400).json({ message: 'Invalid emoji' });
  }

  const comment = await Comment.findById(commentId).populate('user', 'name');
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  const added = await comment.addReaction(req.user.id, emoji);
  if (!added) {
    return res.status(400).json({ message: 'Already reacted with this emoji' });
  }

  const cardDoc = await Card.findById(comment.card).populate('board');

  // Emit real-time reaction update
  if (cardDoc?.board) {
    emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-reaction-added', {
      cardId: comment.card,
      commentId,
      contextType: comment.contextType,
      contextRef: comment.contextRef,
      emoji,
      userId: req.user.id,
      userName: req.user.name,
      reactions: comment.reactions
    });
  }

  // Notify comment author (if not self)
  if (comment.user._id.toString() !== req.user.id) {
    await notificationService.createNotification({
      type: 'comment_reaction',
      title: 'New Reaction',
      message: `${req.user.name} reacted ${emoji} to your comment`,
      user: comment.user._id,
      sender: req.user.id,
      relatedCard: comment.card,
      relatedBoard: cardDoc?.board?._id || cardDoc?.board,
      entityId: commentId,
      entityType: 'Comment',
      deepLink: {
        commentId,
        contextType: comment.contextType,
        contextRef: comment.contextRef,
      }
    });
  }

  res.status(200).json({
    success: true,
    reactions: comment.reactions
  });
});

// ============================================================================
// REMOVE REACTION
// ============================================================================
export const removeReaction = asyncHandler(async (req, res) => {
  const { id: commentId, emoji } = req.params;

  const comment = await Comment.findById(commentId);
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  const removed = await comment.removeReaction(req.user.id, decodeURIComponent(emoji));
  if (!removed) {
    return res.status(400).json({ message: 'Reaction not found' });
  }

  const cardDoc = await Card.findById(comment.card).populate('board');

  // Emit real-time reaction update
  if (cardDoc?.board) {
    emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-reaction-removed', {
      cardId: comment.card,
      commentId,
      contextType: comment.contextType,
      emoji: decodeURIComponent(emoji),
      userId: req.user.id,
      reactions: comment.reactions
    });
  }

  res.status(200).json({
    success: true,
    reactions: comment.reactions
  });
});

// ============================================================================
// PIN COMMENT
// ============================================================================
export const pinComment = asyncHandler(async (req, res) => {
  const { id: commentId } = req.params;

  // Check permission
  const canPin = await checkCommentPermission(req.user, 'pin');
  if (!canPin) {
    return res.status(403).json({ message: 'Not authorized to pin comments' });
  }

  const comment = await Comment.findById(commentId).populate('user', 'name');
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  // Can't pin a threaded reply
  if (comment.parentComment) {
    return res.status(400).json({ message: 'Cannot pin a reply. Only top-level comments can be pinned.' });
  }

  await comment.pin(req.user.id);
  await comment.populate('pinnedBy', 'name');

  const cardDoc = await Card.findById(comment.card).populate('board');

  // Emit real-time pin update
  if (cardDoc?.board) {
    emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-pinned', {
      cardId: comment.card,
      commentId,
      contextType: comment.contextType,
      contextRef: comment.contextRef,
      pinnedBy: {
        _id: req.user.id,
        name: req.user.name
      },
      pinnedAt: comment.pinnedAt
    });
  }

  // Notify comment author (if not self)
  if (comment.user._id.toString() !== req.user.id) {
    await notificationService.createNotification({
      type: 'comment_pinned',
      title: 'Comment Pinned',
      message: `${req.user.name} pinned your comment`,
      user: comment.user._id,
      sender: req.user.id,
      relatedCard: comment.card,
      relatedBoard: cardDoc?.board?._id || cardDoc?.board,
      entityId: commentId,
      entityType: 'Comment',
      deepLink: {
        commentId,
        contextType: comment.contextType,
        contextRef: comment.contextRef,
      }
    });
  }

  res.status(200).json({
    success: true,
    data: comment
  });
});

// ============================================================================
// UNPIN COMMENT
// ============================================================================
export const unpinComment = asyncHandler(async (req, res) => {
  const { id: commentId } = req.params;

  // Check permission
  const canPin = await checkCommentPermission(req.user, 'pin');
  if (!canPin) {
    return res.status(403).json({ message: 'Not authorized to unpin comments' });
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  await comment.unpin();

  const cardDoc = await Card.findById(comment.card).populate('board');

  // Emit real-time unpin update
  if (cardDoc?.board) {
    emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-unpinned', {
      cardId: comment.card,
      commentId,
      contextType: comment.contextType,
      contextRef: comment.contextRef,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Comment unpinned successfully'
  });
});

// ============================================================================
// UPDATE COMMENT
// ============================================================================
export const updateComment = asyncHandler(async (req, res) => {
  const { text, htmlContent } = req.body;

  const comment = await Comment.findById(req.params.id).populate('card');
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  if (comment.user.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  // Save previous version before updating
  const previousContent = comment.text;
  const previousHtmlContent = comment.htmlContent;
  
  // Store for edit history (handled in pre-save hook)
  comment._previousText = previousContent;
  comment._previousHtmlContent = previousHtmlContent;
  comment._editedBy = req.user.id;
  
  // Create version history entry (content is required, use htmlContent stripped of tags if text is empty)
  const contentForVersion = previousContent || 
    (previousHtmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() || 
    '(empty)';
  
  await VersionHistory.createVersion({
    entityType: 'comment',
    entityId: comment._id,
    content: contentForVersion,
    htmlContent: previousHtmlContent,
    mentions: comment.mentions,
    editedBy: req.user.id,
    card: comment.card._id,
    board: comment.card.board,
    changeType: 'edited'
  });

  if (htmlContent) {
    comment.htmlContent = htmlContent;
    comment.text = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  } else if (text) {
    comment.text = text;
  }

  comment.isEdited = true;
  comment.editedAt = new Date();
  await comment.save();

  // Get version count for the response
  const versionCount = await VersionHistory.getVersionCount('comment', comment._id);

  // Log activity
  await Activity.create({
    type: 'comment_updated',
    description: `Updated a comment`,
    user: req.user.id,
    board: comment.card.board,
    card: comment.card._id,
    subtask: comment.subtask,
    nanoSubtask: comment.subtaskNano,
    contextType: comment.contextType === 'card' ? 'task' : comment.contextType,
  });

  // Re-process mentions (notify new mentions)
  try {
    await notificationService.processMentions(comment.htmlContent || '', comment.card, req.user.id);
  } catch (err) {
    console.error('Error processing mentions on comment update:', err);
  }

  // Populate user details for the response
  await comment.populate('user', 'name avatar');
  await comment.populate('pinnedBy', 'name');

  // Emit real-time update with version info
  if (comment.card.board) {
    emitToBoard(comment.card.board.toString(), 'comment-updated', {
      cardId: comment.card._id,
      commentId: comment._id,
      contextType: comment.contextType,
      contextRef: comment.contextRef,
      updates: {
        text: comment.text,
        htmlContent: comment.htmlContent,
        isEdited: true,
        editedAt: comment.editedAt,
        versionCount,
        user: comment.user
      },
      updatedBy: {
        id: req.user.id,
        name: req.user.name
      }
    });
  }

  // Invalidate relevant caches
  invalidateCache(`/api/cards/${comment.card._id}`);
  invalidateCache(`/api/cards/${comment.card._id}/comments`);
  invalidateCache(`/api/versions/comment/${comment._id}/count`);

  res.status(200).json({
    success: true,
    data: {
      ...comment.toObject(),
      versionCount
    },
  });
});

// ============================================================================
// DELETE COMMENT
// ============================================================================
export const deleteComment = asyncHandler(async (req, res) => {
  const comment = await Comment.findById(req.params.id).populate('card');
  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }
  
  // Allow owner or admin/manager to delete
  const isOwner = comment.user.toString() === req.user.id;
  const isAdminOrManager = req.user.role === 'admin' || req.user.role === 'manager';
  
  if (!isOwner && !isAdminOrManager) {
    return res.status(403).json({ message: 'Not authorized' });
  }

  const cardId = comment.card._id || comment.card;
  const boardId = comment.card.board;

  // If this is a parent comment with replies, delete all replies too
  if (comment.replyCount > 0) {
    await Comment.deleteMany({ parentComment: comment._id });
  }

  // If this is a reply, decrement parent's reply count
  if (comment.parentComment) {
    await Comment.findByIdAndUpdate(comment.parentComment, { $inc: { replyCount: -1 } });
  }

  await Comment.findByIdAndDelete(req.params.id);
  await Card.findByIdAndUpdate(cardId, { $pull: { comments: req.params.id } });

  // Log activity
  await Activity.create({
    type: 'comment_deleted',
    description: `Deleted a comment`,
    user: req.user.id,
    board: boardId,
    card: cardId,
    subtask: comment.subtask,
    nanoSubtask: comment.subtaskNano,
    contextType: comment.contextType === 'card' ? 'task' : comment.contextType,
  });

  // Emit real-time delete
  if (boardId) {
    emitToBoard(boardId.toString(), 'comment-deleted', {
      cardId,
      commentId: req.params.id,
      contextType: comment.contextType,
      contextRef: comment.contextRef,
      parentCommentId: comment.parentComment,
    });
  }

  // Invalidate relevant caches
  invalidateCache(`/api/cards/${cardId}`);
  invalidateCache(`/api/cards/${cardId}/comments`);
  invalidateCache(`/api/versions/comment/${comment._id}/count`);

  res.status(200).json({
    success: true,
    message: 'Comment deleted successfully',
  });
});

// ============================================================================
// GET COMMENT BY ID (for deep linking)
// ============================================================================
export const getCommentById = asyncHandler(async (req, res) => {
  const { id: commentId } = req.params;

  const comment = await Comment.findById(commentId)
    .populate('user', 'name avatar')
    .populate('pinnedBy', 'name')
    .populate('parentComment');

  if (!comment) {
    return res.status(404).json({ message: 'Comment not found' });
  }

  res.status(200).json({
    success: true,
    data: comment
  });
});

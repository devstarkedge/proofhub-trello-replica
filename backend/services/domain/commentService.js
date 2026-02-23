/**
 * Comment Service — orchestrates comment operations
 * Pure business logic (no req/res). Controllers handle HTTP.
 */

import Comment from '../../models/Comment.js';
import Card from '../../models/Card.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import Activity from '../../models/Activity.js';
import VersionHistory from '../../models/VersionHistory.js';
import Role from '../../models/Role.js';
import { emitToBoard } from '../../realtime/index.js';
import notificationService from '../../utils/notificationService.js';
import { slackHooks } from '../../utils/slackHooks.js';
import { chatHooks } from '../../utils/chatHooks.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

class CommentService {
  /* ── Context resolution ────────────────────────── */
  async _resolveContext({ cardId, subtaskId, nanoId }) {
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
    if (!cardId) throw new ErrorResponse('Card context is required', 400);
    const card = await Card.findById(cardId).populate('board');
    return {
      boardId: card.board,
      cardId,
      subtaskId: null,
      nanoId: null,
      contextType: 'card',
      contextRef: cardId,
    };
  }

  /* ── Permission check ─────────────────────────── */
  async checkPermission(user, action) {
    if (user.role === 'admin' || user.role === 'manager') return true;
    if (user.roleRef) {
      const role = await Role.findById(user.roleRef);
      if (role) {
        const map = {
          comment: role.permissions?.canComment ?? true,
          edit: role.permissions?.canEditComments ?? true,
          delete: role.permissions?.canDeleteComments ?? true,
          pin: role.permissions?.canPinComments ?? false,
          mention: role.permissions?.canMention ?? true,
        };
        return map[action] ?? true;
      }
    }
    return { comment: true, edit: true, delete: true, pin: false, mention: true }[action] ?? true;
  }

  /* ── Create comment ────────────────────────────── */
  async createComment({ htmlContent, text, card, subtask, subtaskNano, attachments, user }) {
    const ctx = await this._resolveContext({
      cardId: card,
      subtaskId: subtask,
      nanoId: subtaskNano,
    });

    const cardDoc = await Card.findById(ctx.cardId)
      .populate('assignees', 'name')
      .populate('board', 'name');
    if (!cardDoc) throw new ErrorResponse('Card not found', 404);

    const plain = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    const comment = await new Comment({
      text: plain || (text || ''),
      htmlContent: htmlContent || text || '',
      user: user.id,
      card: ctx.cardId,
      subtask: ctx.subtaskId,
      subtaskNano: ctx.nanoId,
      contextType: ctx.contextType,
      contextRef: ctx.contextRef,
      attachments: attachments || [],
    }).save();

    // Activity (fire-and-forget)
    Activity.create({
      type: 'comment_added',
      description: 'Added a new comment',
      user: user.id,
      board: ctx.boardId,
      card: ctx.cardId,
      subtask: ctx.subtaskId,
      nanoSubtask: ctx.nanoId,
      contextType: ctx.contextType,
    }).catch(() => {});

    const populated = await Comment.findById(comment._id)
      .populate('user', 'name avatar')
      .populate('pinnedBy', 'name');

    // Real-time
    if (cardDoc.board) {
      emitToBoard(
        cardDoc.board._id?.toString() || cardDoc.board.toString(),
        'comment-added',
        { cardId: ctx.cardId, contextType: ctx.contextType, contextRef: ctx.contextRef, comment: populated }
      );
    }

    // Notifications (fire-and-forget)
    notificationService.notifyCommentAdded(cardDoc, populated, user.id).catch(() => {});
    slackHooks.onCommentAdded(populated, cardDoc, cardDoc.board, user).catch(() => {});
    chatHooks.onCommentAdded(populated, cardDoc, cardDoc.board, user).catch(() => {});

    return populated;
  }

  /* ── Create reply ──────────────────────────────── */
  async createReply(parentCommentId, { htmlContent, attachments, user }) {
    const parent = await Comment.findById(parentCommentId).populate('user', 'name');
    if (!parent) throw new ErrorResponse('Parent comment not found', 404);
    if (parent.threadDepth >= 3) throw new ErrorResponse('Maximum thread depth reached', 400);

    const cardDoc = await Card.findById(parent.card).populate('board', 'name');
    if (!cardDoc) throw new ErrorResponse('Card not found', 404);

    const plain = (htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    const reply = await new Comment({
      text: plain,
      htmlContent: htmlContent || '',
      user: user.id,
      card: parent.card,
      subtask: parent.subtask,
      subtaskNano: parent.subtaskNano,
      contextType: parent.contextType,
      contextRef: parent.contextRef,
      parentComment: parentCommentId,
      threadDepth: parent.threadDepth + 1,
      attachments: attachments || [],
    }).save();

    await Comment.findByIdAndUpdate(parentCommentId, { $inc: { replyCount: 1 } });

    const populated = await Comment.findById(reply._id).populate('user', 'name avatar');

    // Activity
    Activity.create({
      type: 'comment_added',
      description: 'Replied to a comment',
      user: user.id,
      board: cardDoc.board?._id || cardDoc.board,
      card: parent.card,
      subtask: parent.subtask,
      nanoSubtask: parent.subtaskNano,
      contextType: parent.contextType,
    }).catch(() => {});

    // Real-time
    if (cardDoc.board) {
      emitToBoard(
        cardDoc.board._id?.toString() || cardDoc.board.toString(),
        'comment-reply-added',
        {
          cardId: parent.card,
          parentCommentId,
          contextType: parent.contextType,
          contextRef: parent.contextRef,
          reply: populated,
        }
      );
    }

    // Notify parent author
    if (parent.user._id.toString() !== user.id) {
      notificationService.createNotification({
        type: 'comment_reply',
        title: 'New Reply',
        message: `${user.name} replied to your comment`,
        user: parent.user._id,
        sender: user.id,
        relatedCard: parent.card,
        relatedBoard: cardDoc.board?._id || cardDoc.board,
        entityId: reply._id,
        entityType: 'Comment',
        deepLink: {
          commentId: reply._id,
          contextType: parent.contextType,
          contextRef: parent.contextRef,
          threadParentId: parentCommentId,
        },
      }).catch(() => {});
    }

    return populated;
  }

  /* ── Read operations ───────────────────────────── */
  async getCommentsByContext(filter, { page = 1, limit = 20 }) {
    return Comment.getPaginatedComments(filter, { page, limit });
  }

  async getReplies(parentId, { page = 1, limit = 10 }) {
    return Comment.getReplies(parentId, { page, limit });
  }

  async getCommentById(commentId) {
    const comment = await Comment.findById(commentId)
      .populate('user', 'name avatar')
      .populate('pinnedBy', 'name')
      .populate('parentComment');
    if (!comment) throw new ErrorResponse('Comment not found', 404);
    return comment;
  }

  /* ── Reactions ─────────────────────────────────── */
  async addReaction(commentId, emoji, user) {
    const validEmojis = ['👍', '❤️', '😂', '🚀', '😮', '😢'];
    if (!validEmojis.includes(emoji)) throw new ErrorResponse('Invalid emoji', 400);

    const comment = await Comment.findById(commentId).populate('user', 'name');
    if (!comment) throw new ErrorResponse('Comment not found', 404);

    const added = await comment.addReaction(user.id, emoji);
    if (!added) throw new ErrorResponse('Already reacted with this emoji', 400);

    const cardDoc = await Card.findById(comment.card).populate('board');
    if (cardDoc?.board) {
      emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-reaction-added', {
        cardId: comment.card, commentId, contextType: comment.contextType,
        contextRef: comment.contextRef, emoji, userId: user.id, userName: user.name,
        reactions: comment.reactions,
      });
    }

    if (comment.user._id.toString() !== user.id) {
      notificationService.createNotification({
        type: 'comment_reaction', title: 'New Reaction',
        message: `${user.name} reacted ${emoji} to your comment`,
        user: comment.user._id, sender: user.id,
        relatedCard: comment.card, relatedBoard: cardDoc?.board?._id || cardDoc?.board,
        entityId: commentId, entityType: 'Comment',
        deepLink: { commentId, contextType: comment.contextType, contextRef: comment.contextRef },
      }).catch(() => {});
    }

    return comment.reactions;
  }

  async removeReaction(commentId, emoji, userId) {
    const comment = await Comment.findById(commentId);
    if (!comment) throw new ErrorResponse('Comment not found', 404);

    const removed = await comment.removeReaction(userId, decodeURIComponent(emoji));
    if (!removed) throw new ErrorResponse('Reaction not found', 400);

    const cardDoc = await Card.findById(comment.card).populate('board');
    if (cardDoc?.board) {
      emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-reaction-removed', {
        cardId: comment.card, commentId, contextType: comment.contextType,
        emoji: decodeURIComponent(emoji), userId, reactions: comment.reactions,
      });
    }

    return comment.reactions;
  }

  /* ── Pin / Unpin ───────────────────────────────── */
  async pinComment(commentId, user) {
    const canPin = await this.checkPermission(user, 'pin');
    if (!canPin) throw new ErrorResponse('Not authorized to pin comments', 403);

    const comment = await Comment.findById(commentId).populate('user', 'name');
    if (!comment) throw new ErrorResponse('Comment not found', 404);
    if (comment.parentComment) throw new ErrorResponse('Cannot pin a reply', 400);

    await comment.pin(user.id);
    await comment.populate('pinnedBy', 'name');

    const cardDoc = await Card.findById(comment.card).populate('board');
    if (cardDoc?.board) {
      emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-pinned', {
        cardId: comment.card, commentId, contextType: comment.contextType,
        contextRef: comment.contextRef,
        pinnedBy: { _id: user.id, name: user.name }, pinnedAt: comment.pinnedAt,
      });
    }

    if (comment.user._id.toString() !== user.id) {
      notificationService.createNotification({
        type: 'comment_pinned', title: 'Comment Pinned',
        message: `${user.name} pinned your comment`,
        user: comment.user._id, sender: user.id,
        relatedCard: comment.card, relatedBoard: cardDoc?.board?._id || cardDoc?.board,
        entityId: commentId, entityType: 'Comment',
        deepLink: { commentId, contextType: comment.contextType, contextRef: comment.contextRef },
      }).catch(() => {});
    }

    return comment;
  }

  async unpinComment(commentId, user) {
    const canPin = await this.checkPermission(user, 'pin');
    if (!canPin) throw new ErrorResponse('Not authorized to unpin comments', 403);

    const comment = await Comment.findById(commentId);
    if (!comment) throw new ErrorResponse('Comment not found', 404);

    await comment.unpin();

    const cardDoc = await Card.findById(comment.card).populate('board');
    if (cardDoc?.board) {
      emitToBoard(cardDoc.board._id?.toString() || cardDoc.board.toString(), 'comment-unpinned', {
        cardId: comment.card, commentId, contextType: comment.contextType,
        contextRef: comment.contextRef,
      });
    }

    return { success: true };
  }

  /* ── Update comment ────────────────────────────── */
  async updateComment(commentId, { text, htmlContent, user }) {
    const comment = await Comment.findById(commentId).populate('card');
    if (!comment) throw new ErrorResponse('Comment not found', 404);
    if (comment.user.toString() !== user.id) throw new ErrorResponse('Not authorized', 403);

    const prevContent =
      comment.text ||
      (comment.htmlContent || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() ||
      '(empty)';

    await VersionHistory.createVersion({
      entityType: 'comment',
      entityId: comment._id,
      content: prevContent,
      htmlContent: comment.htmlContent,
      mentions: comment.mentions,
      editedBy: user.id,
      card: comment.card._id,
      board: comment.card.board,
      changeType: 'edited',
    });

    if (htmlContent) {
      comment.htmlContent = htmlContent;
      comment.text = htmlContent.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    } else if (text) {
      comment.text = text;
    }
    comment.isEdited = true;
    comment.editedAt = new Date();
    comment._previousText = prevContent;
    comment._previousHtmlContent = comment.htmlContent;
    comment._editedBy = user.id;
    await comment.save();

    const versionCount = await VersionHistory.getVersionCount('comment', comment._id);

    // Activity
    Activity.create({
      type: 'comment_updated',
      description: 'Updated a comment',
      user: user.id,
      board: comment.card.board,
      card: comment.card._id,
      subtask: comment.subtask,
      nanoSubtask: comment.subtaskNano,
      contextType: comment.contextType === 'card' ? 'task' : comment.contextType,
    }).catch(() => {});

    // Mentions
    notificationService
      .processMentions(comment.htmlContent || '', comment.card, user.id)
      .catch(() => {});

    await comment.populate('user', 'name avatar');
    await comment.populate('pinnedBy', 'name');

    // Real-time
    if (comment.card.board) {
      emitToBoard(comment.card.board.toString(), 'comment-updated', {
        cardId: comment.card._id,
        commentId: comment._id,
        contextType: comment.contextType,
        contextRef: comment.contextRef,
        updates: {
          text: comment.text, htmlContent: comment.htmlContent,
          isEdited: true, editedAt: comment.editedAt, versionCount, user: comment.user,
        },
        updatedBy: { id: user.id, name: user.name },
      });
    }

    return { ...comment.toObject(), versionCount };
  }

  /* ── Delete comment ────────────────────────────── */
  async deleteComment(commentId, user) {
    const comment = await Comment.findById(commentId).populate('card');
    if (!comment) throw new ErrorResponse('Comment not found', 404);

    const isOwner = comment.user.toString() === user.id;
    const isAdminOrManager = user.role === 'admin' || user.role === 'manager';
    if (!isOwner && !isAdminOrManager) throw new ErrorResponse('Not authorized', 403);

    const cardId = comment.card._id || comment.card;
    const boardId = comment.card.board;

    if (comment.replyCount > 0) {
      await Comment.deleteMany({ parentComment: comment._id });
    }
    if (comment.parentComment) {
      await Comment.findByIdAndUpdate(comment.parentComment, { $inc: { replyCount: -1 } });
    }

    await Comment.findByIdAndDelete(commentId);
    await Card.findByIdAndUpdate(cardId, { $pull: { comments: commentId } });

    Activity.create({
      type: 'comment_deleted',
      description: 'Deleted a comment',
      user: user.id,
      board: boardId,
      card: cardId,
      subtask: comment.subtask,
      nanoSubtask: comment.subtaskNano,
      contextType: comment.contextType === 'card' ? 'task' : comment.contextType,
    }).catch(() => {});

    if (boardId) {
      emitToBoard(boardId.toString(), 'comment-deleted', {
        cardId, commentId, contextType: comment.contextType,
        contextRef: comment.contextRef, parentCommentId: comment.parentComment,
      });
    }

    return { success: true };
  }
}

export default new CommentService();

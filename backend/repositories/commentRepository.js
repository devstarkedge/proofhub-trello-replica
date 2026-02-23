/**
 * Comment Repository
 */

import BaseRepository from './BaseRepository.js';
import Comment from '../models/Comment.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Activity from '../models/Activity.js';
import VersionHistory from '../models/VersionHistory.js';
import Role from '../models/Role.js';

class CommentRepository extends BaseRepository {
  constructor() {
    super(Comment);
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findCommentByIdPopulated(commentId) {
    return Comment.findById(commentId)
      .populate('user', 'name avatar')
      .populate('pinnedBy', 'name')
      .populate('parentComment');
  }

  async findCommentByIdWithUser(commentId) {
    return Comment.findById(commentId).populate('user', 'name');
  }

  async findCommentByIdWithCard(commentId) {
    return Comment.findById(commentId).populate('card');
  }

  async getPaginatedComments(filter, options) {
    return Comment.getPaginatedComments(filter, options);
  }

  async getReplies(parentCommentId, options) {
    return Comment.getReplies(parentCommentId, options);
  }

  // ─── Write ────────────────────────────────────────────────────────────────

  async createComment(data) {
    const comment = new Comment(data);
    return comment.save();
  }

  async incrementReplyCount(commentId) {
    return Comment.findByIdAndUpdate(commentId, { $inc: { replyCount: 1 } });
  }

  async decrementReplyCount(commentId) {
    return Comment.findByIdAndUpdate(commentId, { $inc: { replyCount: -1 } });
  }

  async deleteCommentAndReplies(commentId) {
    await Comment.deleteMany({ parentComment: commentId });
    return Comment.findByIdAndDelete(commentId);
  }

  async removeCommentFromCard(cardId, commentId) {
    return Card.findByIdAndUpdate(cardId, { $pull: { comments: commentId } });
  }

  // ─── Context Helpers ──────────────────────────────────────────────────────

  async findCardByIdForComment(cardId) {
    return Card.findById(cardId)
      .populate('assignees', 'name')
      .populate('board', 'name');
  }

  async findSubtaskById(subtaskId) {
    return Subtask.findById(subtaskId).populate('board');
  }

  async findNanoById(nanoId) {
    return SubtaskNano.findById(nanoId).populate('subtask task');
  }

  async findRoleById(roleId) {
    return Role.findById(roleId);
  }

  // ─── Activity / Versions ──────────────────────────────────────────────────

  async createActivity(data) {
    return Activity.create(data);
  }

  async createVersion(entityType, entityId, data) {
    return VersionHistory.createVersion(entityType, entityId, data);
  }

  async getVersionCount(entityType, entityId) {
    return VersionHistory.getVersionCount(entityType, entityId);
  }
}

export default new CommentRepository();

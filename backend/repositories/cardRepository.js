/**
 * Card Repository
 * 
 * All database queries related to Cards, including aggregation pipelines,
 * time tracking, archiving, and copy/move operations.
 */

import BaseRepository from './BaseRepository.js';
import Card from '../models/Card.js';
import List from '../models/List.js';
import Board from '../models/Board.js';
import Label from '../models/Label.js';
import Activity from '../models/Activity.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import Attachment from '../models/Attachment.js';
import RecurringTask from '../models/RecurringTask.js';
import VersionHistory from '../models/VersionHistory.js';
import mongoose from 'mongoose';

const CARD_POPULATE_FULL = [
  { path: 'assignees', select: 'name email avatar' },
  { path: 'members', select: 'name email avatar' },
  { path: 'createdBy', select: 'name email avatar' },
  { path: 'coverImage', select: 'url secureUrl thumbnailUrl fileName fileType' },
  { path: 'estimationTime.user', select: 'name email avatar' },
  { path: 'loggedTime.user', select: 'name email avatar' },
];

class CardRepository extends BaseRepository {
  constructor() {
    super(Card);
  }

  // ─── Read Operations ──────────────────────────────────────────────────────

  async findCardByIdPopulated(cardId) {
    return Card.findById(cardId)
      .populate(CARD_POPULATE_FULL);
  }

  async findCardByIdLean(cardId, select) {
    let query = Card.findById(cardId);
    if (select) query = query.select(select);
    return query.lean();
  }

  async findCardByIdMinimal(cardId) {
    return Card.findById(cardId);
  }

  /**
   * Aggregation-based card fetching for list views.
   * Used by getCards, getCardsByBoard, etc.
   */
  async aggregateCards(pipeline) {
    return Card.aggregate(pipeline);
  }

  async countCardsInList(listId) {
    return Card.countDocuments({ list: listId });
  }

  async countCardsInBoard(boardId, isArchived = false) {
    return Card.countDocuments({ board: boardId, isArchived });
  }

  async countCardsByFilter(filter) {
    return Card.countDocuments(filter);
  }

  async findCardStatuses(boardId) {
    return Card.find({ board: boardId, isArchived: false }).select('status');
  }

  // ─── Write Operations ─────────────────────────────────────────────────────

  async createCard(data) {
    return Card.create(data);
  }

  async updateCardById(cardId, update, populateOpts = CARD_POPULATE_FULL) {
    return Card.findByIdAndUpdate(cardId, update, {
      new: true,
      runValidators: true,
    }).populate(populateOpts);
  }

  async findCardByIdAndPopulate(cardId, populateOpts = CARD_POPULATE_FULL) {
    return Card.findById(cardId).populate(populateOpts);
  }

  // ─── Position / Move Operations ───────────────────────────────────────────

  async updateCardPositions(filter, update) {
    return Card.updateMany(filter, update);
  }

  async getHighestPositionInList(listId) {
    const card = await Card.findOne({ list: listId, isArchived: false })
      .sort({ position: -1 })
      .select('position')
      .lean();
    return card ? card.position : -1;
  }

  // ─── Archive Operations ───────────────────────────────────────────────────

  async archiveCard(cardId, autoDeleteAt = null) {
    return Card.findByIdAndUpdate(
      cardId,
      { isArchived: true, autoDeleteAt },
      { new: true }
    );
  }

  async restoreCard(cardId) {
    return Card.findByIdAndUpdate(
      cardId,
      { isArchived: false, $unset: { autoDeleteAt: '' } },
      { new: true }
    );
  }

  // ─── Copy / Move Helpers ──────────────────────────────────────────────────

  async findLabelsForBoard(boardId) {
    return Label.find({ board: boardId }).lean();
  }

  async upsertLabel(filter, update) {
    return Label.findOneAndUpdate(filter, update, { upsert: true, new: true });
  }

  async findCommentsByCard(cardId) {
    return Comment.find({ card: cardId }).lean();
  }

  async insertManyComments(comments) {
    return Comment.insertMany(comments);
  }

  async findAttachmentsByCard(cardId) {
    return Attachment.find({ card: cardId }).lean();
  }

  async insertManyAttachments(attachments) {
    return Attachment.insertMany(attachments);
  }

  async findSubtasksByBoard(boardId) {
    return Subtask.find({ board: boardId }).lean();
  }

  async findSubtasksByCard(cardId) {
    return Subtask.find({ card: cardId }).lean();
  }

  async findNanosBySubtask(subtaskId) {
    return SubtaskNano.find({ subtask: subtaskId }).lean();
  }

  async insertManyNanos(nanos) {
    return SubtaskNano.insertMany(nanos);
  }

  async updateSubtasksBoard(filter, update) {
    return Subtask.updateMany(filter, update);
  }

  async updateNanosBoard(filter, update) {
    return SubtaskNano.updateMany(filter, update);
  }

  async updateAttachmentsBoard(filter, update) {
    return Attachment.updateMany(filter, update);
  }

  // ─── Version History ──────────────────────────────────────────────────────

  async createVersion(entityType, entityId, data) {
    return VersionHistory.createVersion(entityType, entityId, data);
  }

  async getVersionCount(entityType, entityId) {
    return VersionHistory.getVersionCount(entityType, entityId);
  }

  // ─── Activity ─────────────────────────────────────────────────────────────

  async createActivity(data) {
    return Activity.create(data);
  }

  async getCardActivity(cardId, contextType, options = {}) {
    const { limit = 50, skip = 0 } = options;
    const filter = { card: cardId };
    if (contextType) filter.contextType = contextType;

    const [activities, total] = await Promise.all([
      Activity.find(filter)
        .populate('user', 'name email avatar')
        .sort('-createdAt')
        .limit(limit)
        .skip(skip),
      Activity.countDocuments(filter),
    ]);
    return { activities, total };
  }

  // ─── Lookup Helpers ───────────────────────────────────────────────────────

  async findListById(listId, select) {
    let query = List.findById(listId);
    if (select) query = query.select(select);
    return query.lean();
  }

  async findBoardById(boardId, select) {
    let query = Board.findById(boardId);
    if (select) query = query.select(select);
    return query.lean();
  }

  async findDepartmentById(departmentId, select = 'name') {
    return Department.findById(departmentId).select(select).lean();
  }

  async findLabelsByIds(labelIds, select = 'name') {
    return Label.find({ _id: { $in: labelIds } }).select(select).lean();
  }

  async findUsersByIds(userIds, select = 'name') {
    return User.find({ _id: { $in: userIds } }).select(select).lean();
  }

  async findUserById(userId, select) {
    let query = User.findById(userId);
    if (select) query = query.select(select);
    return query;
  }

  // ─── Copy/Move Destination Helpers ────────────────────────────────────────

  async getCopyMoveDepartments(filter) {
    return Department.find(filter).select('name').sort('name').lean();
  }

  async getCopyMoveProjects(departmentId) {
    return Board.find({
      department: departmentId,
      isArchived: false,
      isDeleted: { $ne: true },
    })
      .select('name')
      .sort('name')
      .lean();
  }

  async getCopyMoveLists(boardId) {
    return List.find({ board: boardId, isArchived: false })
      .select('title position')
      .sort('position')
      .lean();
  }

  async getRecentDestinations(userId) {
    return User.findById(userId)
      .select('recentCopyMoveDestinations')
      .lean();
  }
}

export default new CardRepository();

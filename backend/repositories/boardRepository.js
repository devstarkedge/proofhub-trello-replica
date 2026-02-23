/**
 * Board Repository
 * 
 * All database queries related to Board, including cross-model lookups
 * that are board-scoped (lists, activity, etc.).
 */

import BaseRepository from './BaseRepository.js';
import Board from '../models/Board.js';
import List from '../models/List.js';
import Card from '../models/Card.js';
import Attachment from '../models/Attachment.js';
import Label from '../models/Label.js';
import Activity from '../models/Activity.js';
import Department from '../models/Department.js';
import Notification from '../models/Notification.js';
import RecurringTask from '../models/RecurringTask.js';
import Reminder from '../models/Reminder.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import Comment from '../models/Comment.js';
import User from '../models/User.js';

const BOARD_POPULATE_STANDARD = [
  { path: 'owner', select: 'name email avatar' },
  { path: 'team', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'members', select: 'name email avatar' },
];

const BOARD_POPULATE_FULL = [
  { path: 'owner', select: 'name email avatar role' },
  { path: 'team', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'members', select: 'name email avatar role' },
];

class BoardRepository extends BaseRepository {
  constructor() {
    super(Board);
  }

  // ─── Read Operations ──────────────────────────────────────────────────────

  async findBoardsForUser(userId, userRole, userTeam) {
    const query = {
      isDeleted: { $ne: true },
      $or: [{ owner: userId }, { members: userId }],
    };
    if (userRole === 'admin' || userRole === 'manager') {
      query.$or.push({ visibility: 'public' });
    }
    if (userTeam) {
      query.$or.push({ team: userTeam });
    }
    return Board.find(query)
      .populate(BOARD_POPULATE_STANDARD)
      .sort('-createdAt')
      .lean();
  }

  async findBoardsByDepartment(departmentId) {
    return Board.find({
      department: departmentId,
      isArchived: false,
      isDeleted: { $ne: true },
    })
      .populate([
        { path: 'owner', select: 'name email avatar' },
        { path: 'team', select: 'name' },
        { path: 'members', select: 'name email avatar' },
      ])
      .sort('-createdAt')
      .lean();
  }

  async findBoardByIdPopulated(boardId) {
    return Board.findById(boardId).populate(BOARD_POPULATE_FULL).lean();
  }

  async findBoardByIdFull(boardId) {
    return Board.findById(boardId).populate(BOARD_POPULATE_STANDARD);
  }

  async findBoardByIdMinimal(boardId, select = '_id name department') {
    return Board.findById(boardId).select(select).lean();
  }

  // ─── Workflow Complete (aggregated board data) ────────────────────────────

  async getWorkflowData(boardId) {
    const [board, lists, subtasks, nanos] = await Promise.all([
      Board.findById(boardId).populate(BOARD_POPULATE_FULL).lean(),
      List.find({ board: boardId, isArchived: false }).sort('position').lean(),
      Subtask.find({ board: boardId }).select('assignees').lean(),
      SubtaskNano.find({ board: boardId }).select('assignees').lean(),
    ]);
    return { board, lists, subtasks, nanos };
  }

  async getWorkflowCards(listIds) {
    return Card.find({ list: { $in: listIds }, isArchived: false })
      .select('title list description position status priority labels assignees board coverImage startDate dueDate estimation start_date end_date subtaskStats loggedTime')
      .populate('assignees', 'name email avatar role')
      .populate('members', 'name email avatar')
      .populate('coverImage', 'url secureUrl thumbnailUrl fileName fileType isCover')
      .sort({ list: 1, position: 1 })
      .lean();
  }

  async getWorkflowLabels(boardId) {
    return Label.find({ board: boardId }).select('name color').lean();
  }

  async getWorkflowRecurringTasks(cardIds) {
    return RecurringTask.find({ card: { $in: cardIds }, isActive: true })
      .select('card pattern interval')
      .lean();
  }

  async getWorkflowAttachmentCounts(cardIds) {
    return Attachment.aggregate([
      { $match: { card: { $in: cardIds }, isDeleted: false } },
      { $group: { _id: '$card', count: { $sum: 1 } } },
    ]);
  }

  async findUsersByIds(userIds, select = 'name email avatar role') {
    return User.find({ _id: { $in: userIds } }).select(select).lean();
  }

  // ─── Write Operations ─────────────────────────────────────────────────────

  async createBoard(data) {
    return Board.create(data);
  }

  async updateBoardById(boardId, update) {
    return Board.findByIdAndUpdate(boardId, update, {
      new: true,
      runValidators: true,
    }).populate(BOARD_POPULATE_STANDARD);
  }

  async addBoardToDepartment(departmentId, boardId) {
    return Department.findByIdAndUpdate(departmentId, {
      $push: { boards: boardId },
    });
  }

  async removeBoardFromDepartment(departmentId, boardId) {
    return Department.findByIdAndUpdate(departmentId, {
      $pull: { boards: boardId },
    });
  }

  async removeBoardsFromDepartment(departmentId, boardIds) {
    return Department.findByIdAndUpdate(departmentId, {
      $pullAll: { boards: boardIds },
    });
  }

  async addBoardsToDepartment(departmentId, boardIds) {
    return Department.findByIdAndUpdate(departmentId, {
      $addToSet: { boards: { $each: boardIds } },
    });
  }

  async createDefaultLists(boardId) {
    const defaultLists = ['To Do', 'In Progress', 'Review', 'Done'];
    return Promise.all(
      defaultLists.map((title, idx) =>
        List.create({ title, board: boardId, position: idx })
      )
    );
  }

  // ─── Delete Operations ────────────────────────────────────────────────────

  async deleteAllBoardData(boardId, cardIds, subtaskIds, listIds) {
    await Promise.all([
      Reminder.deleteMany({ project: boardId }),
      Label.deleteMany({ board: boardId }),
      SubtaskNano.deleteMany({ subtask: { $in: subtaskIds } }),
      Subtask.deleteMany({ board: boardId }),
      Comment.deleteMany({ card: { $in: cardIds } }),
      Attachment.deleteMany({ card: { $in: cardIds } }),
      RecurringTask.deleteMany({ card: { $in: cardIds } }),
    ]);

    // Delete cards from each list, then lists, then activity
    await Promise.all([
      Card.deleteMany({ list: { $in: listIds } }),
      List.deleteMany({ board: boardId }),
      Activity.deleteMany({ board: boardId }),
    ]);
  }

  async getCardIdsForBoard(boardId) {
    const cards = await Card.find({ board: boardId }).select('_id').lean();
    return cards.map((c) => c._id);
  }

  async getSubtaskIdsForBoard(boardId) {
    const subtasks = await Subtask.find({ board: boardId }).select('_id').lean();
    return subtasks.map((s) => s._id);
  }

  async getListIdsForBoard(boardId) {
    const lists = await List.find({ board: boardId }).select('_id').lean();
    return lists.map((l) => l._id);
  }

  // ─── Soft Delete / Restore ────────────────────────────────────────────────

  async softDeleteBoards(boardIds, userId) {
    return Board.updateMany(
      { _id: { $in: boardIds } },
      { isDeleted: true, deletedAt: new Date(), deletedBy: userId }
    );
  }

  async findSoftDeletedBoards(boardIds) {
    return Board.find({ _id: { $in: boardIds }, isDeleted: true })
      .select('_id name owner department')
      .lean();
  }

  async restoreSoftDeletedBoards(boardIds, userId) {
    return Board.updateMany(
      {
        _id: { $in: boardIds },
        isDeleted: true,
        deletedBy: userId,
      },
      { $set: { isDeleted: false, deletedAt: null, deletedBy: null } }
    );
  }

  // ─── Activity ─────────────────────────────────────────────────────────────

  async createActivity(data) {
    return Activity.create(data);
  }

  async getProjectActivity(boardId, limit = 50) {
    return Activity.find({ board: boardId })
      .populate('user', 'name avatar')
      .sort('-createdAt')
      .limit(limit)
      .lean();
  }
}

export default new BoardRepository();

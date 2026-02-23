/**
 * Board Service — orchestrates board/project operations
 * Pure business logic (no req/res). Controllers handle HTTP.
 */

import Board from '../../models/Board.js';
import List from '../../models/List.js';
import Card from '../../models/Card.js';
import Attachment from '../../models/Attachment.js';
import Label from '../../models/Label.js';
import Activity from '../../models/Activity.js';
import Department from '../../models/Department.js';
import RecurringTask from '../../models/RecurringTask.js';
import Reminder from '../../models/Reminder.js';
import Subtask from '../../models/Subtask.js';
import SubtaskNano from '../../models/SubtaskNano.js';
import Comment from '../../models/Comment.js';
import User from '../../models/User.js';
import { emitToAll } from '../../realtime/index.js';
import notificationService from '../../utils/notificationService.js';
import { slackHooks } from '../../utils/slackHooks.js';
import { chatHooks } from '../../utils/chatHooks.js';
import {
  notifyProjectCreatedInBackground,
  sendProjectEmailsInBackground,
  logProjectActivityInBackground,
} from '../../utils/backgroundTasks.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const BOARD_POPULATE = [
  { path: 'owner', select: 'name email avatar' },
  { path: 'team', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'members', select: 'name email avatar' },
];

class BoardService {
  /* ── Queries ───────────────────────────────────── */

  async getBoardsForUser(user) {
    const query = {
      isDeleted: { $ne: true },
      $or: [{ owner: user.id }, { members: user.id }],
    };
    if (user.role === 'admin' || user.role === 'manager') {
      query.$or.push({ visibility: 'public' });
    }
    if (user.team) query.$or.push({ team: user.team });

    return Board.find(query).populate(BOARD_POPULATE).sort('-createdAt').lean();
  }

  async getBoardsByDepartment(departmentId) {
    return Board.find({
      department: departmentId,
      isArchived: false,
      isDeleted: { $ne: true },
    })
      .populate(BOARD_POPULATE)
      .sort('-createdAt')
      .lean();
  }

  async getBoardById(boardId, user) {
    const board = await Board.findById(boardId).populate(BOARD_POPULATE);
    if (!board || board.isDeleted) throw new ErrorResponse('Board not found', 404);

    const ownerId =
      typeof board.owner === 'object' ? board.owner?._id?.toString() : board.owner?.toString();
    const hasAccess =
      ownerId === user.id ||
      board.members?.some((m) => m?._id?.toString() === user.id) ||
      board.visibility === 'public';
    if (!hasAccess) throw new ErrorResponse('Not authorized to access this board', 403);

    // Calculate progress
    const cards = await Card.find({ board: board._id, isArchived: false }).select('status');
    const totalCards = cards.length;
    const completedCards = cards.filter((c) => c.status === 'done').length;
    const progress = totalCards > 0 ? Math.round((completedCards / totalCards) * 100) : 0;

    const data = board.toObject();
    data.progress = progress;
    data.totalCards = totalCards;
    data.completedCards = completedCards;
    return data;
  }

  /* ── Workflow Complete (single-request board + lists + cards) */

  async getWorkflowComplete(projectId, user) {
    const [board, lists, subtasks, nanos] = await Promise.all([
      Board.findById(projectId)
        .populate('owner', 'name email avatar role')
        .populate('team', 'name')
        .populate('department', 'name')
        .populate('members', 'name email avatar role')
        .lean(),
      List.find({ board: projectId, isArchived: false }).sort('position').lean(),
      Subtask.find({ board: projectId }).select('assignees').lean(),
      SubtaskNano.find({ board: projectId }).select('assignees').lean(),
    ]);

    if (!board || board.isDeleted) throw new ErrorResponse('Board not found', 404);

    const hasAccess =
      board.owner?._id?.toString() === user.id ||
      board.members?.some((m) => m?._id?.toString() === user.id) ||
      board.visibility === 'public' ||
      user.role === 'admin';
    if (!hasAccess) throw new ErrorResponse('Not authorized to access this board', 403);

    const listIds = lists.map((l) => l._id);

    const cards = await Card.find({ list: { $in: listIds }, isArchived: false })
      .select(
        'title list description position status priority labels assignees board coverImage startDate dueDate estimation start_date end_date subtaskStats loggedTime'
      )
      .populate('assignees', 'name email avatar role')
      .populate('members', 'name email avatar')
      .populate('coverImage', 'url secureUrl thumbnailUrl fileName fileType isCover')
      .sort({ list: 1, position: 1 })
      .lean();

    // Aggregate all project members
    const memberMap = this._buildMemberMap(board, cards, subtasks, nanos);
    const missingIds = [];
    memberMap.forEach((v, k) => { if (!v.name) missingIds.push(k); });
    if (missingIds.length > 0) {
      const users = await User.find({ _id: { $in: missingIds } }).select('name email avatar role').lean();
      users.forEach((u) => memberMap.set(u._id.toString(), u));
    }
    board.members = Array.from(memberMap.values()).filter((u) => u.name);

    // Populate labels manually
    const allLabels = await Label.find({ board: projectId }).select('name color').lean();
    const labelMap = new Map(allLabels.map((l) => [l._id.toString(), l]));
    const cardsWithLabels = cards.map((c) => {
      if (c.labels?.length) {
        c.labels = c.labels
          .map((lid) => {
            const idStr = typeof lid === 'object' ? lid._id?.toString() || lid.toString() : lid.toString();
            return labelMap.get(idStr) || null;
          })
          .filter(Boolean);
      }
      return c;
    });

    // Batch recurrence & attachment counts
    const cardIds = cardsWithLabels.map((c) => c._id);
    const [recurringTasks, attachmentAgg] = await Promise.all([
      RecurringTask.find({ card: { $in: cardIds }, isActive: true }).select('card').lean(),
      Attachment.aggregate([
        { $match: { card: { $in: cardIds }, isDeleted: false } },
        { $group: { _id: '$card', count: { $sum: 1 } } },
      ]),
    ]);
    const recurringSet = new Set(recurringTasks.map((r) => r.card.toString()));
    const attachMap = new Map(attachmentAgg.map((a) => [a._id.toString(), a.count]));

    // Group cards by list
    const cardsByList = {};
    listIds.forEach((id) => { cardsByList[id.toString()] = []; });
    cardsWithLabels.forEach((c) => {
      const lid = c.list.toString();
      if (cardsByList[lid]) {
        cardsByList[lid].push({
          ...c,
          hasRecurrence: recurringSet.has(c._id.toString()),
          attachmentsCount: attachMap.get(c._id.toString()) || 0,
        });
      }
    });

    return { board, lists, cardsByList };
  }

  /* ── Workflow data (board only, with department auth) */

  async getWorkflowData(departmentId, projectId, user) {
    const board = await Board.findById(projectId)
      .populate('owner', 'name email avatar role')
      .populate('team', 'name')
      .populate('department', 'name')
      .populate('members', 'name email avatar role')
      .lean();

    if (!board || board.isDeleted) throw new ErrorResponse('Project not found', 404);

    const boardDepartmentId =
      (typeof board.department === 'object' && board.department?._id) || board.department;
    if (!boardDepartmentId || boardDepartmentId.toString() !== departmentId) {
      throw new ErrorResponse('This project does not belong to the specified department', 403);
    }

    const hasAccess =
      board.owner?._id?.toString() === user.id ||
      board.members?.some((m) => m?._id?.toString() === user.id) ||
      board.visibility === 'public' ||
      user.role === 'admin' ||
      (user.department && user.department.toString() === departmentId);
    if (!hasAccess) {
      throw new ErrorResponse('Not authorized to access this project workflow', 403);
    }

    return board;
  }

  /* ── Create board ──────────────────────────────── */

  async createBoard(data, user) {
    const dept = data.department || user.department;
    if (!dept) throw new ErrorResponse('Department is required to create a project', 400);

    if (user.role === 'manager' && dept.toString() !== user.department?.toString()) {
      throw new ErrorResponse('Managers can only create boards for their department', 403);
    }

    const board = await Board.create({
      ...data,
      team: data.team || user.team,
      department: dept,
      owner: user.id,
      members: data.members || [user.id],
      visibility: data.visibility || 'public',
      background: data.background || '#6366f1',
      status: data.status || 'planning',
      priority: data.priority || 'medium',
      labels: data.labels || [],
    });

    // Add to department
    await Department.findByIdAndUpdate(board.department, { $push: { projects: board._id } });

    // Default lists
    const defaultLists = ['To Do', 'In Progress', 'Review', 'Done'];
    await Promise.all(
      defaultLists.map((title, i) => List.create({ title, board: board._id, position: i }))
    );

    const populated = await Board.findById(board._id).populate(BOARD_POPULATE);

    // Background tasks (after returning)
    if (data.runBackgroundTasks) {
      logProjectActivityInBackground({
        type: 'board_created',
        description: `Created board "${data.name}"`,
        user: user.id,
        board: board._id,
      });
      notifyProjectCreatedInBackground(board, user.id);
      chatHooks.onProjectCreated(board, user).catch(() => {});
      if (data.members?.length > 0) sendProjectEmailsInBackground(board, data.members);
    } else {
      await Activity.create({
        type: 'board_created',
        description: `Created board "${data.name}"`,
        user: user.id,
        board: board._id,
      });
      await notificationService.notifyProjectCreated(board, user.id);
      chatHooks.onProjectCreated(board, user).catch(() => {});
    }

    return populated;
  }

  /* ── Update board ──────────────────────────────── */

  async updateBoard(boardId, updates, user) {
    let board = await Board.findById(boardId);
    if (!board) throw new ErrorResponse('Board not found', 404);

    const ownerId =
      typeof board.owner === 'object' ? board.owner._id?.toString() : board.owner?.toString();
    if (ownerId !== user.id && user.role !== 'admin' && user.role !== 'manager') {
      throw new ErrorResponse('Not authorized to update this board', 403);
    }

    const prev = board.toObject();

    board = await Board.findByIdAndUpdate(boardId, updates, { new: true, runValidators: true })
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar');

    // Diff + activity
    const { changes, activityTasks } = this._detectBoardChanges(prev, updates, user, board._id);

    // Chat hooks for member changes
    if (Array.isArray(updates.members)) {
      const prevM = (prev.members || []).map((m) => m.toString());
      const nextM = updates.members.map((m) => m.toString());
      nextM.filter((id) => !prevM.includes(id)).forEach((id) => {
        chatHooks.onProjectMemberAdded(board, id, user).catch(() => {});
      });
      prevM.filter((id) => !nextM.includes(id)).forEach((id) => {
        chatHooks.onProjectMemberRemoved(board, id, user).catch(() => {});
      });
    }

    if (activityTasks.length) await Promise.all(activityTasks);

    if (changes.length) {
      notificationService.notifyProjectUpdated(board, user.id, changes.slice(0, 3).join(', ')).catch(() => {});
      slackHooks.onProjectUpdated(board, changes, user).catch(() => {});
      chatHooks.onProjectUpdated(board, { changes }, user).catch(() => {});
    }

    emitToAll('board-updated', { boardId: board._id.toString(), updates, projectName: board.name });

    return board;
  }

  /* ── Activity ──────────────────────────────────── */

  async getProjectActivity(boardId, limit = 50) {
    return Activity.find({ board: boardId })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /* ── Delete board (hard) ───────────────────────── */

  async deleteBoard(boardId, user) {
    const board = await Board.findById(boardId);
    if (!board) throw new ErrorResponse('Board not found', 404);
    if (board.owner.toString() !== user.id && user.role !== 'admin') {
      throw new ErrorResponse('Not authorized to delete this board', 403);
    }

    await notificationService.notifyTaskDeleted(board, user.id, true);
    chatHooks.onProjectDeleted(board, user).catch(() => {});

    const cards = await Card.find({ board: board._id });
    const cardIds = cards.map((c) => c._id);
    const subtasks = await Subtask.find({ board: board._id });
    const subtaskIds = subtasks.map((s) => s._id);

    await Promise.all([
      Reminder.deleteMany({ project: board._id }),
      Label.deleteMany({ board: board._id }),
      SubtaskNano.deleteMany({ subtask: { $in: subtaskIds } }),
      Subtask.deleteMany({ board: board._id }),
      Comment.deleteMany({ card: { $in: cardIds } }),
      Attachment.deleteMany({ card: { $in: cardIds } }),
      RecurringTask.deleteMany({ card: { $in: cardIds } }),
      Card.deleteMany({ board: board._id }),
      List.deleteMany({ board: board._id }),
      Activity.deleteMany({ board: board._id }),
    ]);

    if (board.department) {
      await Department.findByIdAndUpdate(board.department, { $pull: { projects: board._id } });
    }
    await board.deleteOne();

    return { success: true };
  }

  /* ── Bulk soft-delete / undo ───────────────────── */

  async bulkDeleteBoards(projectIds, user) {
    if (!projectIds?.length) throw new ErrorResponse('projectIds must be a non-empty array', 400);
    if (projectIds.length > 50) throw new ErrorResponse('Cannot delete more than 50 projects', 400);

    const userRole = user.role.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'manager') {
      throw new ErrorResponse('Not authorized to perform bulk delete', 403);
    }

    const boards = await Board.find({ _id: { $in: projectIds }, isDeleted: { $ne: true } })
      .select('_id name owner department')
      .lean();
    if (!boards.length) throw new ErrorResponse('No valid projects found', 404);

    const authorizedIds = boards.map((b) => b._id);
    const found = new Set(boards.map((b) => b._id.toString()));
    const notFound = projectIds.filter((id) => !found.has(id));

    await Board.updateMany(
      { _id: { $in: authorizedIds } },
      { isDeleted: true, deletedAt: new Date(), deletedBy: user.id }
    );

    // Department cleanup
    const deptMap = {};
    boards.forEach((b) => {
      if (b.department) {
        const d = b.department.toString();
        (deptMap[d] ||= []).push(b._id);
      }
    });
    await Promise.all(
      Object.entries(deptMap).map(([dId, ids]) =>
        Department.findByIdAndUpdate(dId, { $pullAll: { projects: ids } })
      )
    );

    // Fire-and-forget notifications
    Promise.all(
      boards.map((b) => notificationService.notifyTaskDeleted(b, user.id, true).catch(() => {}))
    ).catch(() => {});

    return {
      deleted: authorizedIds.map((id) => id.toString()),
      deletedNames: boards.map((b) => b.name),
      failed: notFound,
      total: authorizedIds.length,
    };
  }

  async undoBulkDelete(projectIds, user) {
    if (!projectIds?.length) throw new ErrorResponse('projectIds must be a non-empty array', 400);

    const UNDO_WINDOW_MS = 30_000;
    const threshold = new Date(Date.now() - UNDO_WINDOW_MS);

    const boards = await Board.find({
      _id: { $in: projectIds },
      isDeleted: true,
      deletedBy: user.id,
      deletedAt: { $gte: threshold },
    })
      .select('_id name department')
      .lean();

    if (!boards.length) {
      throw new ErrorResponse('No projects eligible for undo. Window may have expired.', 400);
    }

    const restoreIds = boards.map((b) => b._id);
    await Board.updateMany({ _id: { $in: restoreIds } }, { isDeleted: false, deletedAt: null, deletedBy: null });

    const deptMap = {};
    boards.forEach((b) => {
      if (b.department) {
        const d = b.department.toString();
        (deptMap[d] ||= []).push(b._id);
      }
    });
    await Promise.all(
      Object.entries(deptMap).map(([dId, ids]) =>
        Department.findByIdAndUpdate(dId, { $addToSet: { projects: { $each: ids } } })
      )
    );

    return {
      restored: restoreIds.map((id) => id.toString()),
      restoredNames: boards.map((b) => b.name),
      total: boards.length,
    };
  }

  /* ═══ Private helpers ═══════════════════════════ */

  _buildMemberMap(board, cards, subtasks, nanos) {
    const map = new Map();
    const add = (u) => {
      if (!u) return;
      const id = u._id ? u._id.toString() : u.toString();
      if (u._id && !map.has(id)) map.set(id, u);
      else if (!map.has(id)) map.set(id, { _id: id });
    };
    if (board.owner) add(board.owner);
    board.members?.forEach(add);
    cards.forEach((c) => c.assignees?.forEach(add));
    subtasks.forEach((s) => s.assignees?.forEach(add));
    nanos.forEach((n) => n.assignees?.forEach(add));
    return map;
  }

  _detectBoardChanges(prev, updates, user, boardId) {
    const changes = [];
    const activityTasks = [];

    const track = (condition, change, actType, desc, meta) => {
      if (!condition) return;
      changes.push(change);
      activityTasks.push(
        Activity.create({
          type: actType,
          description: desc,
          user: user.id,
          board: boardId,
          contextType: 'board',
          ...(meta ? { metadata: meta } : {}),
        })
      );
    };

    track(
      updates.name && updates.name !== prev.name,
      `Name updated to "${updates.name}"`,
      'project_updated',
      `Renamed project to "${updates.name}"`
    );
    track(
      typeof updates.description === 'string' && updates.description !== prev.description,
      'Description updated',
      'project_updated',
      'Updated project description'
    );
    track(
      updates.status && updates.status !== prev.status,
      `Status changed to ${updates.status}`,
      'project_status_changed',
      `Status changed to ${updates.status}`,
      { from: prev.status, to: updates.status }
    );
    track(
      updates.priority && updates.priority !== prev.priority,
      `Priority changed to ${updates.priority}`,
      'project_priority_changed',
      `Priority changed to ${updates.priority}`,
      { from: prev.priority, to: updates.priority }
    );

    if (Array.isArray(updates.members)) {
      const prevM = (prev.members || []).map((m) => m.toString());
      const nextM = updates.members.map((m) => m.toString());
      const added = nextM.filter((id) => !prevM.includes(id));
      const removed = prevM.filter((id) => !nextM.includes(id));

      track(
        added.length > 0,
        `Members added (${added.length})`,
        'project_member_added',
        `Added ${added.length} member(s)`,
        { added }
      );
      track(
        removed.length > 0,
        `Members removed (${removed.length})`,
        'project_member_removed',
        `Removed ${removed.length} member(s)`,
        { removed }
      );
    }

    return { changes, activityTasks };
  }
}

export default new BoardService();

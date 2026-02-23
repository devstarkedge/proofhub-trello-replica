/**
 * Card Service — orchestrates card/task operations
 * 
 * Handles business logic for card CRUD, movement, archival, time tracking.
 * Read-heavy aggregation pipelines remain in the controller for now since
 * they are HTTP-response-specific (pagination, aggregation shape).
 * 
 * Pure business logic — no req/res references.
 */

import Card from '../../models/Card.js';
import List from '../../models/List.js';
import Board from '../../models/Board.js';
import User from '../../models/User.js';
import Label from '../../models/Label.js';
import Activity from '../../models/Activity.js';
import VersionHistory from '../../models/VersionHistory.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { emitToBoard, emitFinanceDataRefresh } from '../../realtime/index.js';
import notificationService from '../../utils/notificationService.js';
import { slackHooks } from '../../utils/slackHooks.js';
import { chatHooks } from '../../utils/chatHooks.js';
import { processTimeEntriesWithOwnership } from '../../utils/timeEntryUtils.js';

class CardService {
  /* ── Create ────────────────────────────────────── */

  async createCard(data, user) {
    const {
      title, description, list, board,
      assignees: assigneesFromBody, assignee,
      members, labels, priority, dueDate, startDate, position,
    } = data;

    const resolvedAssignees = Array.isArray(assigneesFromBody)
      ? assigneesFromBody
      : assignee ? [assignee] : [];

    const [cardList, cardCount] = await Promise.all([
      List.findById(list).lean(),
      position == null ? Card.countDocuments({ list }) : Promise.resolve(position),
    ]);

    if (!cardList) throw new ErrorResponse('List not found', 404);

    const card = await Card.create({
      title,
      description,
      list,
      board,
      assignees: resolvedAssignees,
      members: members || [],
      labels: labels || [],
      priority,
      dueDate,
      startDate,
      status: cardList.title.toLowerCase().replace(/\s+/g, '-'),
      position: cardCount,
      createdBy: user.id,
    });

    // Activity
    await Activity.create({
      type: 'card_created',
      description: `Created card "${title}"`,
      user: user.id,
      board,
      card: card._id,
      list,
      contextType: 'task',
    });

    // Real-time
    emitToBoard(board, 'card-created', {
      card,
      listId: list,
      createdBy: { id: user.id, name: user.name },
    });

    // Notifications + webhooks (fire-and-forget)
    this._notifyAssignees(card, resolvedAssignees, board, user).catch(() => {});
    this._notifyMembers(card, members, user).catch(() => {});

    const populated = await Card.findById(card._id)
      .populate('assignees', 'name email avatar')
      .populate('members', 'name email avatar')
      .populate('createdBy', 'name email avatar');

    return populated;
  }

  /* ── Update ────────────────────────────────────── */

  async updateCard(cardId, updates, user) {
    let card = await Card.findById(cardId);
    if (!card) throw new ErrorResponse('Card not found', 404);

    // Snapshot old values for change detection
    const old = {
      title: card.title || '',
      description: card.description || '',
      status: card.status,
      priority: card.priority || '',
      dueDate: card.dueDate,
      startDate: card.startDate,
      assignees: card.assignees?.map((a) => a.toString()) || [],
      labels: card.labels?.map((l) => l.toString()) || [],
    };

    // Process time tracking with strict ownership
    const currentUser = { id: user.id, name: user.name };
    const timeEntryWarnings = [];
    try {
      for (const field of ['estimationTime', 'loggedTime', 'billedTime']) {
        if (updates[field] !== undefined) {
          const type = field === 'estimationTime' ? 'estimation' : field === 'loggedTime' ? 'logged' : 'billed';
          const result = processTimeEntriesWithOwnership(updates[field], card[field], currentUser, type);
          updates[field] = result.entries;
          if (result.errors.length) timeEntryWarnings.push(...result.errors);
        }
      }
    } catch (validationError) {
      throw new ErrorResponse(validationError.message, 400);
    }

    // Persist
    card = await Card.findByIdAndUpdate(cardId, updates, { new: true, runValidators: true })
      .populate('assignees', 'name email avatar')
      .populate('members', 'name email avatar')
      .populate('createdBy', 'name email avatar')
      .populate('coverImage', 'url secureUrl thumbnailUrl fileName fileType')
      .populate('estimationTime.user', 'name email avatar')
      .populate('loggedTime.user', 'name email avatar')
      .populate('billedTime.user', 'name email avatar');

    // Activity logging + notifications (fire-and-forget background)
    this._processUpdateSideEffects(card, updates, old, user).catch((err) =>
      console.error('Card update side effects error:', err)
    );

    return { card, timeEntryWarnings };
  }

  /* ── Move (same board) ─────────────────────────── */

  async moveCard(cardId, destinationListId, newPosition, user) {
    const card = await Card.findById(cardId)
      .populate('list', 'title')
      .populate('board');
    if (!card) throw new ErrorResponse('Card not found', 404);

    const sourceListId = card.list._id;
    const sourceListTitle = card.list.title;
    const oldPosition = card.position;

    const destinationList = await List.findById(destinationListId);
    if (!destinationList) throw new ErrorResponse('Destination list not found', 404);

    if (sourceListId.toString() === destinationListId) {
      // Same list reorder
      if (newPosition === oldPosition) return card;
      if (newPosition > oldPosition) {
        await Card.updateMany(
          { list: sourceListId, position: { $gt: oldPosition, $lte: newPosition } },
          { $inc: { position: -1 } }
        );
      } else {
        await Card.updateMany(
          { list: sourceListId, position: { $gte: newPosition, $lt: oldPosition } },
          { $inc: { position: 1 } }
        );
      }
      card.position = newPosition;
    } else {
      // Cross-list move
      await Card.updateMany(
        { list: sourceListId, position: { $gt: oldPosition } },
        { $inc: { position: -1 } }
      );
      await Card.updateMany(
        { list: destinationListId, position: { $gte: newPosition } },
        { $inc: { position: 1 } }
      );
      card.list = destinationListId;
      card.position = newPosition;
      card.status = destinationList.title.toLowerCase().replace(/\s+/g, '-');
    }

    await card.save();

    // Background side effects (don't block response)
    setImmediate(async () => {
      try {
        await Activity.create({
          type: 'card_moved',
          description: `Moved card "${card.title}"`,
          user: user.id,
          board: card.board,
          card: card._id,
          list: card.list,
          contextType: 'task',
          metadata: { fromList: sourceListTitle, toList: destinationList.title, newPosition },
        });

        emitToBoard(card.board.toString(), 'card-moved', {
          cardId: card._id,
          sourceListId,
          destinationListId,
          newPosition,
          status: card.status,
          movedBy: { id: user.id, name: user.name },
        });

        emitToBoard(card.board.toString(), 'card-updated', {
          cardId: card._id,
          updates: { list: destinationListId, position: newPosition, status: card.status },
          updatedBy: { id: user.id, name: user.name },
        });

        if (sourceListId.toString() !== destinationListId) {
          await notificationService.notifyTaskUpdated(card, user.id, {
            moved: true,
            fromList: sourceListTitle,
            toList: destinationList.title,
          });
        }
      } catch (err) {
        console.error('moveCard background error:', err);
      }
    });

    return card;
  }

  /* ── Delete ────────────────────────────────────── */

  async deleteCard(cardId, user) {
    const card = await Card.findById(cardId);
    if (!card) throw new ErrorResponse('Card not found', 404);

    const boardId = card.board;

    await notificationService.notifyTaskDeleted(card, user.id);

    const boardForDelete = await Board.findById(card.board).select('name department').lean();
    chatHooks.onTaskDeleted(card, boardForDelete, user).catch(() => {});

    await Activity.create({
      type: 'card_deleted',
      description: `Deleted card "${card.title}"`,
      user: user.id,
      board: card.board,
      list: card.list,
    });

    emitToBoard(boardId.toString(), 'card-deleted', {
      cardId: card._id,
      listId: card.list,
      deletedBy: { id: user.id, name: user.name },
    });

    await card.deleteOne();
    return { success: true };
  }

  /* ── Archive / Restore ─────────────────────────── */

  async archiveCard(cardId, user) {
    const card = await Card.findById(cardId);
    if (!card) throw new ErrorResponse('Card not found', 404);

    const now = new Date();
    card.isArchived = true;
    card.archivedAt = now;
    card.autoDeleteAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await card.save();

    await Activity.create({
      type: 'card_archived',
      description: `Archived card "${card.title}"`,
      user: user.id,
      board: card.board,
      card: card._id,
      list: card.list,
      contextType: 'task',
    });

    emitToBoard(card.board.toString(), 'card-archived', {
      cardId: card._id,
      listId: card.list,
      archivedBy: { id: user.id, name: user.name },
    });

    return card;
  }

  async restoreCard(cardId, user) {
    const card = await Card.findById(cardId);
    if (!card) throw new ErrorResponse('Card not found', 404);
    if (!card.isArchived) throw new ErrorResponse('Card is not archived', 400);

    const now = new Date();
    if (card.autoDeleteAt && card.autoDeleteAt <= now) {
      throw new ErrorResponse('Archived task is past its restore window', 410);
    }

    card.isArchived = false;
    card.archivedAt = null;
    card.autoDeleteAt = null;

    const maxPosCard = await Card.findOne({ list: card.list, isArchived: false }).sort({ position: -1 });
    card.position = (maxPosCard?.position ?? -1) + 1;
    await card.save();

    await Activity.create({
      type: 'card_restored',
      description: `Restored card "${card.title}" from archive`,
      user: user.id,
      board: card.board,
      card: card._id,
      list: card.list,
      contextType: 'task',
    });

    emitToBoard(card.board.toString(), 'card-restored', {
      cardId: card._id,
      listId: card.list,
      restoredBy: { id: user.id, name: user.name },
    });

    return card;
  }

  /* ── Time Tracking ─────────────────────────────── */

  async addTimeEntry(cardId, type, entry, user) {
    const card = await Card.findById(cardId);
    if (!card) throw new ErrorResponse('Card not found', 404);

    const arrayField = type === 'estimation' ? 'estimationTime' : type === 'logged' ? 'loggedTime' : 'billedTime';
    if (!card[arrayField]) card[arrayField] = [];

    card[arrayField].push({ ...entry, user: user.id });
    await card.save();

    const populated = await Card.findById(cardId)
      .populate(`${arrayField}.user`, 'name email avatar');

    // Activity for logged/estimation time
    if (type === 'logged' || type === 'estimation') {
      Activity.create({
        type: type === 'logged' ? 'time_logged' : 'estimation_updated',
        description: type === 'logged'
          ? `Logged ${entry.hours}h ${entry.minutes}m of work`
          : `Updated estimation to ${entry.hours}h ${entry.minutes}m`,
        user: user.id,
        board: card.board,
        card: card._id,
        contextType: 'task',
        metadata: { hours: entry.hours, minutes: entry.minutes },
      }).catch(() => {});
    }

    // Finance refresh for logged/billed
    if (type === 'logged' || type === 'billed') {
      emitFinanceDataRefresh({
        changeType: `${type}_time`,
        cardId: card._id.toString(),
        boardId: card.board.toString(),
      });
    }

    return populated[arrayField];
  }

  /* ═══ Private Helpers ════════════════════════════ */

  async _notifyAssignees(card, assignees, boardId, user) {
    if (!assignees?.length) return;
    await notificationService.notifyTaskAssigned(card, assignees, user.id);
    const boardData = await Board.findById(boardId).select('name department').lean();
    slackHooks.onTaskAssigned(card, boardData, assignees, user).catch(() => {});
    chatHooks.onTaskCreated(card, boardData, user).catch(() => {});
    chatHooks.onTaskAssigned(card, assignees, boardData, user).catch(() => {});
  }

  async _notifyMembers(card, members, user) {
    if (!members?.length) return;
    for (const memberId of members) {
      if (memberId.toString() !== user.id) {
        await notificationService.createNotification({
          type: 'member_added',
          title: 'Added to Task',
          message: `${user.name} added you to "${card.title}"`,
          user: memberId,
          sender: user.id,
          relatedCard: card._id,
          relatedBoard: card.board,
        });
      }
    }
  }

  /**
   * Process all side effects of a card update (activities, notifications, webhooks).
   * Runs asynchronously — callers should .catch() errors.
   */
  async _processUpdateSideEffects(card, updates, old, user) {
    const activities = [];
    const changedFields = [];

    // ── Title change
    if (updates.title && updates.title !== old.title) {
      activities.push({
        type: 'title_changed',
        description: `Changed title from "${old.title}" to "${updates.title}"`,
        metadata: { oldTitle: old.title, newTitle: updates.title },
      });
    }

    // ── Description change
    if (updates.description !== undefined && updates.description !== old.description) {
      // Save version history
      const strippedOld = old.description
        ? old.description.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
        : '';
      await VersionHistory.createVersion({
        entityType: 'card_description',
        entityId: card._id,
        content: strippedOld || '(empty)',
        htmlContent: old.description || '',
        mentions: card.descriptionMentions || [],
        editedBy: user.id,
        card: card._id,
        board: card.board,
        changeType: 'edited',
      });

      activities.push({
        type: 'description_changed',
        description: 'Updated the task description',
        metadata: { hasDescription: !!updates.description },
      });

      const versionCount = await VersionHistory.getVersionCount('card_description', card._id);
      emitToBoard(card.board.toString(), 'description-updated', {
        cardId: card._id,
        description: updates.description,
        versionCount,
        updatedBy: { id: user.id, name: user.name },
      });

      changedFields.push({ field: 'description', message: `Description updated for "${card.title}"` });

      // Mention notifications
      await notificationService.processMentions(updates.description, card, user.id);
    }

    // ── Status change
    if (updates.status && updates.status !== old.status) {
      activities.push({
        type: 'status_changed',
        description: `Changed status from "${old.status}" to "${updates.status}"`,
        metadata: { oldStatus: old.status, newStatus: updates.status },
      });
      const boardData = await Board.findById(card.board).select('name').lean();
      if (updates.status === 'done') {
        changedFields.push({ field: 'status', message: `"${card.title}" has been marked as complete`, special: 'done' });
        slackHooks.onTaskCompleted(card, boardData, user).catch(() => {});
      } else {
        changedFields.push({ field: 'status', message: `Status changed to "${updates.status}" for "${card.title}"` });
        slackHooks.onTaskStatusChanged(card, boardData, old.status, updates.status, user).catch(() => {});
      }
      chatHooks.onTaskStatusChanged(card, old.status, updates.status, boardData, user).catch(() => {});
    }

    // ── Priority change
    if (updates.priority && updates.priority !== old.priority) {
      activities.push({
        type: 'priority_changed',
        description: `Changed priority from "${old.priority || 'None'}" to "${updates.priority}"`,
        metadata: { oldPriority: old.priority || 'None', newPriority: updates.priority },
      });
      changedFields.push({ field: 'priority', message: `Priority changed to "${updates.priority}" for "${card.title}"` });
    }

    // ── Due date change
    const oldDueMs = old.dueDate ? new Date(old.dueDate).getTime() : null;
    const newDueMs = updates.dueDate !== undefined ? (updates.dueDate ? new Date(updates.dueDate).getTime() : null) : undefined;
    if (newDueMs !== undefined && oldDueMs !== newDueMs) {
      const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'None';
      activities.push({
        type: 'due_date_changed',
        description: `Changed due date from ${fmt(old.dueDate)} to ${fmt(updates.dueDate)}`,
        metadata: { oldDate: fmt(old.dueDate), newDate: fmt(updates.dueDate) },
      });
      const dateStr = updates.dueDate ? new Date(updates.dueDate).toLocaleDateString() : 'removed';
      changedFields.push({ field: 'dueDate', message: `Due date ${updates.dueDate ? 'changed to ' + dateStr : 'removed'} for "${card.title}"` });
    }

    // ── Start date change
    const oldStartMs = old.startDate ? new Date(old.startDate).getTime() : null;
    const newStartMs = updates.startDate !== undefined ? (updates.startDate ? new Date(updates.startDate).getTime() : null) : undefined;
    if (newStartMs !== undefined && oldStartMs !== newStartMs) {
      changedFields.push({ field: 'startDate', message: `Start date updated for "${card.title}"` });
    }

    // ── Labels change
    if (updates.labels !== undefined) {
      const newLabels = (updates.labels || []).map((l) => l.toString()).sort();
      const sortedOld = [...old.labels].sort();
      if (JSON.stringify(newLabels) !== JSON.stringify(sortedOld)) {
        try {
          const [labelDocs, oldLabelDocs] = await Promise.all([
            Label.find({ _id: { $in: updates.labels } }).select('name'),
            Label.find({ _id: { $in: old.labels } }).select('name'),
          ]);
          const labelNames = labelDocs.map((l) => l.name).join(', ');
          const oldLabelNames = oldLabelDocs.map((l) => l.name).join(', ') || 'None';
          activities.push({
            type: 'labels_changed',
            description: `Changed labels from "${oldLabelNames}" to "${labelNames || 'None'}"`,
            metadata: { oldLabels: oldLabelNames, newLabels: labelNames || 'None' },
          });
        } catch (err) {
          console.error('Error creating labels activity:', err);
        }
        changedFields.push({ field: 'labels', message: `Labels updated for "${card.title}"` });
      }
    }

    // ── Assignees change
    if (updates.assignees !== undefined || updates.assignee !== undefined) {
      const newAssignees = updates.assignees || (updates.assignee ? [updates.assignee] : []);
      const added = newAssignees.filter((id) => !old.assignees.includes(id.toString()));
      const removed = old.assignees.filter((id) => !newAssignees.map(String).includes(id));

      if (added.length) {
        await notificationService.notifyTaskAssigned(card, added, user.id);
        const addedUsers = await User.find({ _id: { $in: added } }).select('name');
        activities.push({
          type: 'member_added',
          description: 'added members to the card',
          metadata: { memberName: addedUsers.map((u) => u.name).join(', '), memberIds: added },
        });
        const boardData = await Board.findById(card.board).select('name department').lean();
        slackHooks.onTaskAssigned(card, boardData, added, user).catch(() => {});
        chatHooks.onTaskAssigned(card, added, boardData, user).catch(() => {});
      }
      if (removed.length) {
        const removedUsers = await User.find({ _id: { $in: removed } }).select('name');
        activities.push({
          type: 'member_removed',
          description: 'removed members from the card',
          metadata: { memberName: removedUsers.map((u) => u.name).join(', '), memberIds: removed },
        });
      }
    }

    // ── Time tracking changes
    if (updates.loggedTime) {
      const newLen = updates.loggedTime.length;
      const oldLen = card.loggedTime?.length || 0;
      if (newLen > oldLen) {
        const lastEntry = updates.loggedTime[newLen - 1];
        if (!lastEntry._id) {
          activities.push({
            type: 'time_logged',
            description: `Logged ${lastEntry.hours}h ${lastEntry.minutes}m of work`,
            metadata: { hours: lastEntry.hours, minutes: lastEntry.minutes, description: lastEntry.description },
          });
          const boardForTime = await Board.findById(card.board).select('name department').lean();
          chatHooks.onTimeEntryAdded(card, lastEntry, boardForTime, user).catch(() => {});
        }
      }
      emitFinanceDataRefresh({ changeType: 'logged_time', cardId: card._id.toString(), boardId: card.board.toString() });
    }

    if (updates.estimationTime) {
      const newLen = updates.estimationTime.length;
      const oldLen = card.estimationTime?.length || 0;
      if (newLen > oldLen) {
        const lastEntry = updates.estimationTime[newLen - 1];
        if (!lastEntry._id) {
          activities.push({
            type: 'estimation_updated',
            description: `Updated estimation to ${lastEntry.hours}h ${lastEntry.minutes}m`,
            metadata: { hours: lastEntry.hours, minutes: lastEntry.minutes, reason: lastEntry.reason },
          });
        }
      }
    }

    if (updates.billedTime) {
      emitFinanceDataRefresh({ changeType: 'billed_time', cardId: card._id.toString(), boardId: card.board.toString() });
    }

    // ── Persist activities
    if (activities.length) {
      await Promise.all(
        activities.map((a) =>
          Activity.create({
            ...a,
            user: user.id,
            board: card.board,
            card: card._id,
            contextType: 'task',
          })
        )
      );
    }

    // ── Emit real-time update
    emitToBoard(card.board.toString(), 'card-updated', {
      cardId: card._id,
      updates,
      updatedBy: { id: user.id, name: user.name },
    });

    // ── Notifications for field changes
    if (changedFields.length > 0 && card.assignees?.length > 0) {
      if (changedFields.length === 1) {
        const c = changedFields[0];
        await notificationService.notifyTaskUpdated(card, user.id, { [c.field]: true, message: c.message });
      } else {
        await notificationService.notifyTaskUpdated(card, user.id, {
          multipleChanges: true,
          changedFields: changedFields.map((c) => c.field),
        });
      }

      const nonStatus = changedFields.filter((c) => c.field !== 'status');
      if (nonStatus.length) {
        const boardData = await Board.findById(card.board).select('name').lean();
        slackHooks.onTaskUpdated(card, boardData, nonStatus.map((c) => c.field), user).catch(() => {});
      }

      const boardInfo = await Board.findById(card.board).select('name department').lean();
      chatHooks.onTaskUpdated(card, { changedFields: changedFields.map((c) => c.field) }, boardInfo, user).catch(() => {});
    }
  }
}

export default new CardService();

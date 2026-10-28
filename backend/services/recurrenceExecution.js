import mongoose from 'mongoose';
import RecurringTask from '../models/RecurringTask.js';
import Subtask from '../models/Subtask.js';
import Card from '../models/Card.js';
import RecurrenceOccurrence from '../models/RecurrenceOccurrence.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

/** An occurrence and its schedule advancement commit together. The same key
 * always returns the original instance, including after a worker retry. */
export async function executeRecurrence(recurringTaskId, { occurrenceKey, expectedOccurrence, actorId, session: providedSession } = {}) {
  if (typeof occurrenceKey !== 'string' || !occurrenceKey || occurrenceKey.length > 200) throw new ErrorResponse('A stable occurrence key is required', 400);
  const session = providedSession || await mongoose.startSession();
  let result;
  const execute = async () => {
      const recurrence = await RecurringTask.findById(recurringTaskId).session(session);
      if (!recurrence) { result = { skipped: true, reason: 'not found' }; return; }
      const receipt = await RecurrenceOccurrence.findOne({ recurrence: recurringTaskId, occurrenceKey }).session(session).lean();
      if (receipt) {
        const original = await Subtask.findById(receipt.subtask).session(session);
        result = original ? { created: false, recurrence, subtask: original } : { skipped: true, reason: 'instance deleted' };
        return;
      }
      const existing = await Subtask.findOne({ recurringTaskId, occurrenceKey }).session(session);
      if (existing) { result = { created: false, recurrence, subtask: existing }; return; }
      if (!recurrence.isActive || expectedOccurrence && new Date(recurrence.nextOccurrence).getTime() !== new Date(expectedOccurrence).getTime()) { result = { skipped: true, reason: 'inactive or superseded' }; return; }
      if (occurrenceKey.startsWith('scheduled:') && recurrence.recurBehavior !== 'onSchedule' || occurrenceKey.startsWith('completion:') && recurrence.recurBehavior === 'onSchedule') { result = { skipped: true, reason: 'trigger mode changed' }; return; }
      if (recurrence.shouldEnd()) {
        recurrence.isActive = false; await recurrence.save({ session });
        result = { skipped: true, reason: 'end condition met' }; return;
      }
      const card = await Card.findById(recurrence.card).session(session).select('title board').lean();
      if (!card || String(card.board) !== String(recurrence.board)) throw new ErrorResponse('Recurring parent not found', 404);
      const template = recurrence.subtaskTemplate || {};
      const dueDate = recurrence.nextOccurrence || new Date();
      let startDate = null;
      if (recurrence.startDate && recurrence.dueDate) startDate = new Date(new Date(dueDate).getTime() - Math.ceil((recurrence.dueDate - recurrence.startDate) / 86400000) * 86400000);
      const subtask = new Subtask({
        workspaceId: recurrence.workspaceId, task: recurrence.card, board: recurrence.board,
        title: template.title || `${card.title || 'Task'} - Recurring Instance`, description: template.description || '',
        status: 'todo', priority: template.priority || 'medium', assignees: template.assignees || [], tags: template.tags || [],
        dueDate, startDate, order: await Subtask.countDocuments({ task: recurrence.card }).session(session),
        createdBy: actorId || recurrence.createdBy, isRecurring: true, recurringTaskId, occurrenceKey,
        breadcrumbs: { task: card.title || '' }
      });
      await subtask.save({ session });
      await RecurrenceOccurrence.create([{ workspaceId: recurrence.workspaceId, recurrence: recurringTaskId, card: recurrence.card, occurrenceKey, subtask: subtask._id }], { session });
      recurrence.generatedSubtasks.addToSet(subtask._id);
      recurrence.completedOccurrences += 1;
      recurrence.lastOccurrence = new Date();
      recurrence.nextOccurrence = recurrence.calculateNextOccurrence(new Date(Math.max(new Date(dueDate).getTime(), Date.now())));
      if (recurrence.shouldEnd()) recurrence.isActive = false;
      await recurrence.save({ session });
      result = { created: true, recurrence, subtask };
  };
  try {
    if (providedSession) await execute(); else await session.withTransaction(execute);
  } finally { if (!providedSession) await session.endSession(); }
  return result;
}

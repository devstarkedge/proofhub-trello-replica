/**
 * Recurrence Scheduler (Legacy Compatibility Layer)
 *
 * The polling-based processDueRecurrences() and processOnScheduleRecurrences()
 * have been replaced by event-driven delayed jobs in:
 *   - schedulers/recurringTaskScheduler.js
 *   - workers/recurringTaskWorker.js
 *
 * This file now only exports handleTaskCompletion() for use by subtaskController.
 * The old startRecurringTaskScheduler() is a no-op for backward compatibility.
 */
import RecurringTask from '../models/RecurringTask.js';
import Subtask from '../models/Subtask.js';
import { enqueueCompletionTriggered } from '../schedulers/recurringTaskScheduler.js';

// Handle task completion triggers for 'whenComplete' and 'whenDone' behaviors
export const handleTaskCompletion = async (subtaskId, newStatus) => {
  try {
    const subtask = await Subtask.findById(subtaskId);
    if (!subtask || !subtask.isRecurring || !subtask.recurringTaskId) {
      return;
    }

    const recurrence = await RecurringTask.findById(subtask.recurringTaskId);
    if (!recurrence || !recurrence.isActive) {
      return;
    }

    const shouldTrigger =
      (recurrence.recurBehavior === 'whenComplete' && newStatus === 'closed') ||
      (recurrence.recurBehavior === 'whenDone' && (newStatus === 'done' || newStatus === 'closed'));

    if (shouldTrigger) {
      // For 'daysAfter' type, calculate delay from now
      let delayMs = 0;
      if (recurrence.scheduleType === 'daysAfter') {
        const days = recurrence.daysAfterOptions?.days || 1;
        delayMs = days * 24 * 60 * 60 * 1000;
        // Also update nextOccurrence for tracking
        recurrence.nextOccurrence = new Date(Date.now() + delayMs);
        await recurrence.save();
      }

      // Enqueue via BullMQ delayed job instead of processing in-line
      await enqueueCompletionTriggered(recurrence._id, delayMs);
    }
  } catch (error) {
    console.error('Error handling task completion for recurrence:', error);
  }
};

// No-op stubs for backward compatibility (server.js still imports these)
export const startRecurringTaskScheduler = () => {
  // Replaced by event-driven scheduler — recovery happens in queueManager.initQueues()
};

export const stopRecurringTaskScheduler = () => {
  // No-op
};

// Legacy exports kept for any code that may reference them
export const processDueRecurrences = () => {};
export const processOnScheduleRecurrences = () => {};

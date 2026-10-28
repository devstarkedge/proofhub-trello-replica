import { executeRecurrence } from '../services/recurrenceExecution.js';
import { recurrenceJobIdentity } from '../services/recurrenceJobIdentity.js';
/**
 * Recurring Task Worker
 *
 * Processes delayed jobs from the 'flowtask.recurring-task' queue.
 * Each job generates one subtask instance for a recurring task,
 * then self-schedules the next occurrence.
 *
 * Job types:
 *   generate-task-instance — create a subtask and chain the next job
 */
import { Worker } from '../queues/runtime.js';
import { getWorkerConnection } from '../queues/connection.js';
import RecurringTask from '../models/RecurringTask.js';
import { emitToBoard } from '../realtime/index.js';
import { refreshCardHierarchyStats } from '../utils/hierarchyStats.js';
import { scheduleNextOccurrence } from '../schedulers/recurringTaskScheduler.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

// ─── Job Handlers ───────────────────────────────────────────────────────────

const JOB_HANDLERS = {
  /**
   * Generate one subtask instance for a recurring task.
   * After success, self-schedule the next occurrence.
   */
  async 'generate-task-instance'(job) {
    const { recurringTaskId } = job.data;

    // This worker runs outside any Express request, so there is no ambient
    // workspace context — look the task up unscoped (its own _id already
    // disambiguates it), then run everything else inside its workspace.
    let recurringTask = await workspaceContext.runUnscoped(
      async () => await RecurringTask.findById(recurringTaskId)
    );
    if (!recurringTask) {
      return { skipped: true, reason: 'inactive or not found' };
    }

    return workspaceContext.run({ workspaceId: recurringTask.workspaceId }, async () => {
      const identity = recurrenceJobIdentity(job, recurringTask);
      if (identity.skipped) return identity;
      const { occurrenceKey, expectedOccurrence } = identity;
      const result = await executeRecurrence(recurringTaskId, {
        occurrenceKey, expectedOccurrence, actorId: recurringTask.createdBy
      });
      if (result.skipped) return result;
      const { subtask } = result;
      recurringTask = result.recurrence;

      // Refresh card hierarchy stats
      await refreshCardHierarchyStats(recurringTask.card);

      // Emit real-time updates
      const boardId = recurringTask.board.toString();
      if (result.created) {
      emitToBoard(boardId, 'recurrence-triggered', {
        cardId: recurringTask.card,
        recurrence: recurringTask,
        subtask,
      });

      emitToBoard(boardId, 'hierarchy-subtask-changed', {
        type: 'created',
        taskId: recurringTask.card,
        subtask,
      });

      }

      // Self-schedule next occurrence (only if still active & onSchedule)
      if (recurringTask.isActive && recurringTask.nextOccurrence) {
        await scheduleNextOccurrence(recurringTask);
      }

      console.log(
        `[Worker:RecurringTask] generated subtask for ${recurringTaskId} (occurrence #${recurringTask.completedOccurrences})`
      );
      return { created: true, subtaskId: subtask._id.toString() };
    });
  },
};

// ─── Worker Creation ────────────────────────────────────────────────────────

let recurringTaskWorker = null;

export function startRecurringTaskWorker() {
  if (recurringTaskWorker && !recurringTaskWorker.closing) return recurringTaskWorker;
  recurringTaskWorker = new Worker(
    'flowtask.recurring-task',
    async (job) => {
      const handler = JOB_HANDLERS[job.name];
      if (!handler) {
        throw new Error(`Unknown recurring task job type: ${job.name}`);
      }
      return handler(job);
    },
    {
      connection: getWorkerConnection(),
      concurrency: 3,
    }
  );

  recurringTaskWorker.on('failed', (job, err) => {
    console.error(`[Worker:RecurringTask] ${job?.name}:${job?.id} failed: ${err.message}`);
  });

  console.log('[Worker:RecurringTask] started');
  return recurringTaskWorker;
}

export function getRecurringTaskWorker() {
  return recurringTaskWorker;
}

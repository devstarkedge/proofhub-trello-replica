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
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { getWorkerConnection } from '../queues/connection.js';
import RecurringTask from '../models/RecurringTask.js';
import Subtask from '../models/Subtask.js';
import Card from '../models/Card.js';
import { emitToBoard } from '../realtime/index.js';
import { refreshCardHierarchyStats } from '../utils/hierarchyStats.js';
import { scheduleNextOccurrence } from '../schedulers/recurringTaskScheduler.js';

// ─── Subtask Generation (moved from recurrenceScheduler.js) ─────────────────

async function generateRecurringSubtask(recurringTask, userId) {
  const card = await Card.findById(recurringTask.card).populate('board', 'name');
  if (!card) {
    throw new Error('Parent card not found');
  }

  const currentCount = await Subtask.countDocuments({ task: recurringTask.card });

  let subtaskDueDate = recurringTask.nextOccurrence;
  let subtaskStartDate = null;

  if (recurringTask.startDate && recurringTask.dueDate) {
    const daysDiff = Math.ceil(
      (new Date(recurringTask.dueDate) - new Date(recurringTask.startDate)) / (1000 * 60 * 60 * 24)
    );
    subtaskStartDate = new Date(subtaskDueDate);
    subtaskStartDate.setDate(subtaskStartDate.getDate() - daysDiff);
  }

  const template = recurringTask.subtaskTemplate || {};
  const parentTitle = card.title || 'Task';

  const validTags = (template.tags || []).filter(
    (tag) => tag && mongoose.Types.ObjectId.isValid(tag)
  );

  const subtask = await Subtask.create({
    task: recurringTask.card,
    board: recurringTask.board,
    title: template.title || `${parentTitle} - Recurring Instance`,
    description: template.description || '',
    status: 'todo',
    priority: template.priority || 'medium',
    assignees: template.assignees || [],
    tags: validTags,
    dueDate: subtaskDueDate,
    startDate: subtaskStartDate,
    order: currentCount,
    createdBy: userId,
    isRecurring: true,
    recurringTaskId: recurringTask._id,
    breadcrumbs: {
      project: card.board?.name || '',
      task: card.title || '',
    },
  });

  return subtask;
}

// ─── Job Handlers ───────────────────────────────────────────────────────────

const JOB_HANDLERS = {
  /**
   * Generate one subtask instance for a recurring task.
   * After success, self-schedule the next occurrence.
   */
  async 'generate-task-instance'(job) {
    const { recurringTaskId } = job.data;

    const recurringTask = await RecurringTask.findById(recurringTaskId);
    if (!recurringTask || !recurringTask.isActive) {
      return { skipped: true, reason: 'inactive or not found' };
    }

    // Check end conditions
    if (recurringTask.shouldEnd()) {
      recurringTask.isActive = false;
      await recurringTask.save();
      return { skipped: true, reason: 'end condition met' };
    }

    // Generate subtask
    const subtask = await generateRecurringSubtask(recurringTask, recurringTask.createdBy);

    // Update recurrence state
    recurringTask.generatedSubtasks.push(subtask._id);
    recurringTask.completedOccurrences += 1;
    recurringTask.lastOccurrence = new Date();
    recurringTask.nextOccurrence = recurringTask.calculateNextOccurrence();

    // Check if should end after this occurrence
    if (recurringTask.shouldEnd()) {
      recurringTask.isActive = false;
    }

    await recurringTask.save();

    // Refresh card hierarchy stats
    await refreshCardHierarchyStats(recurringTask.card);

    // Emit real-time updates
    const boardId = recurringTask.board.toString();
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

    // Self-schedule next occurrence (only if still active & onSchedule)
    if (recurringTask.isActive && recurringTask.nextOccurrence) {
      await scheduleNextOccurrence(recurringTask);
    }

    console.log(
      `[Worker:RecurringTask] generated subtask for ${recurringTaskId} (occurrence #${recurringTask.completedOccurrences})`
    );
    return { created: true, subtaskId: subtask._id.toString() };
  },
};

// ─── Worker Creation ────────────────────────────────────────────────────────

let recurringTaskWorker = null;

export function startRecurringTaskWorker() {
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

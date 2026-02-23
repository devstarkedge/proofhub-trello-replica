import mongoose from 'mongoose';
import RecurringTask from '../models/RecurringTask.js';
import Subtask from '../models/Subtask.js';
import Card from '../models/Card.js';
import { emitToBoard } from '../realtime/index.js';
import { refreshCardHierarchyStats } from './hierarchyStats.js';

// Generate subtask from recurring task (shared logic)
const generateRecurringSubtask = async (recurringTask, userId) => {
  const card = await Card.findById(recurringTask.card).populate('board', 'name');
  if (!card) {
    throw new Error('Parent card not found');
  }

  const currentCount = await Subtask.countDocuments({ task: recurringTask.card });
  
  // Calculate dates based on template
  let subtaskDueDate = recurringTask.nextOccurrence;
  let subtaskStartDate = null;
  
  if (recurringTask.startDate && recurringTask.dueDate) {
    const daysDiff = Math.ceil((new Date(recurringTask.dueDate) - new Date(recurringTask.startDate)) / (1000 * 60 * 60 * 24));
    subtaskStartDate = new Date(subtaskDueDate);
    subtaskStartDate.setDate(subtaskStartDate.getDate() - daysDiff);
  }

  const template = recurringTask.subtaskTemplate || {};
  const parentTitle = card.title || 'Task';
  
  // Filter tags to ensure only valid ObjectIds are included
  const validTags = (template.tags || []).filter(tag => {
    // Check if tag is a valid ObjectId or can be converted to one
    return tag && mongoose.Types.ObjectId.isValid(tag);
  });
  
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
      task: card.title || ''
    }
  });

  return subtask;
};

// Process a single recurring task
const processRecurringTask = async (recurringTask) => {
  try {
    // Check if should end
    if (recurringTask.shouldEnd()) {
      recurringTask.isActive = false;
      await recurringTask.save();
      console.log(`Recurring task ${recurringTask._id} has ended`);
      return null;
    }

    // Generate new subtask
    const subtask = await generateRecurringSubtask(recurringTask, recurringTask.createdBy);
    
    // Update recurrence
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
    emitToBoard(recurringTask.board.toString(), 'recurrence-triggered', {
      cardId: recurringTask.card,
      recurrence: recurringTask,
      subtask
    });

    emitToBoard(recurringTask.board.toString(), 'hierarchy-subtask-changed', {
      type: 'created',
      taskId: recurringTask.card,
      subtask
    });

    console.log(`Generated recurring subtask for task ${recurringTask.card}`);
    return subtask;
  } catch (error) {
    console.error(`Error processing recurring task ${recurringTask._id}:`, error);
    return null;
  }
};

// Check and process all due recurring tasks
const processDueRecurrences = async () => {
  const now = new Date();
  
  try {
    // Find all active recurrences that are due (nextOccurrence <= now)
    // Only process 'onSchedule' behavior - other behaviors are triggered by task completion
    // Exclude 'daysAfter' type as they are triggered on task completion
    const dueRecurrences = await RecurringTask.find({
      isActive: true,
      nextOccurrence: { $lte: now },
      scheduleType: { $ne: 'daysAfter' },
      recurBehavior: 'onSchedule' // Only process schedule-based recurrences
    });

    console.log(`Found ${dueRecurrences.length} due recurring tasks (onSchedule behavior)`);

    for (const recurrence of dueRecurrences) {
      await processRecurringTask(recurrence);
    }

    return dueRecurrences.length;
  } catch (error) {
    console.error('Error processing due recurrences:', error);
    return 0;
  }
};

// Handle 'onSchedule' recurrences at 11 PM user timezone
const processOnScheduleRecurrences = async () => {
  const now = new Date();
  
  try {
    // Find all 'onSchedule' recurrences that need to be processed
    const onScheduleRecurrences = await RecurringTask.find({
      isActive: true,
      recurBehavior: 'onSchedule',
      nextOccurrence: { $lte: now }
    });

    console.log(`Found ${onScheduleRecurrences.length} on-schedule recurring tasks`);

    for (const recurrence of onScheduleRecurrences) {
      // Check if it's 11 PM in user's timezone
      const userTime = new Date().toLocaleString('en-US', { 
        timeZone: recurrence.timezone || 'UTC',
        hour: 'numeric',
        hour12: false
      });
      
      // Process if it's 11 PM or if nextOccurrence has passed
      if (parseInt(userTime) === 23 || recurrence.nextOccurrence <= now) {
        await processRecurringTask(recurrence);
      }
    }

    return onScheduleRecurrences.length;
  } catch (error) {
    console.error('Error processing on-schedule recurrences:', error);
    return 0;
  }
};

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
      // For 'daysAfter' type, calculate next occurrence from completion
      if (recurrence.scheduleType === 'daysAfter') {
        recurrence.nextOccurrence = recurrence.calculateNextOccurrence(new Date());
        await recurrence.save();
      }
      
      // Generate next instance
      await processRecurringTask(recurrence);
    }
  } catch (error) {
    console.error('Error handling task completion for recurrence:', error);
  }
};

// Scheduler interval ID
let schedulerInterval = null;

// Start the recurring task scheduler
export const startRecurringTaskScheduler = () => {
  // Run every minute to check for due recurrences
  schedulerInterval = setInterval(async () => {
    await processDueRecurrences();
  }, 60 * 1000); // Every minute

  // Also run on-schedule check every hour
  setInterval(async () => {
    await processOnScheduleRecurrences();
  }, 60 * 60 * 1000); // Every hour

  // Run immediately on startup
  processDueRecurrences();
  
  console.log('Recurring task scheduler started');
};

// Stop the scheduler
export const stopRecurringTaskScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Recurring task scheduler stopped');
  }
};

export { processDueRecurrences, processOnScheduleRecurrences };

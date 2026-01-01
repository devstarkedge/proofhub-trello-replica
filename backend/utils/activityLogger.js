/**
 * Optimized Activity Logger Utility
 * Batches multiple activity logs and executes them in parallel
 * to reduce database round-trips and improve API response times.
 */

import Activity from '../models/Activity.js';

/**
 * Creates multiple activity logs in parallel
 * @param {Array} activities - Array of activity objects
 * @returns {Promise} - Resolves when all activities are created
 */
export const batchCreateActivities = async (activities) => {
  if (!activities || activities.length === 0) return [];
  
  // Use insertMany for better performance with multiple activities
  try {
    return await Activity.insertMany(activities, { ordered: false });
  } catch (error) {
    // If insertMany fails, fall back to parallel individual creates
    console.error('Batch activity insert failed, using fallback:', error.message);
    return Promise.all(activities.map(act => Activity.create(act).catch(e => {
      console.error('Activity create failed:', e.message);
      return null;
    })));
  }
};

/**
 * Detects changes between old and new entity states and generates activity logs
 * @param {Object} options - Configuration options
 * @param {Object} options.oldEntity - Previous state of the entity
 * @param {Object} options.newEntity - New state of the entity
 * @param {string} options.entityType - Type: 'task', 'subtask', 'nanoSubtask'
 * @param {string} options.userId - ID of user making changes
 * @param {Object} options.refs - Reference IDs (board, card, subtask, nanoSubtask)
 * @returns {Array} - Array of activity objects to create
 */
export const detectChangesAndGenerateActivities = ({
  oldEntity,
  newEntity,
  entityType,
  userId,
  refs
}) => {
  const activities = [];
  const { board, card, subtask, nanoSubtask } = refs;
  
  const baseActivity = {
    user: userId,
    board,
    card,
    contextType: entityType,
    ...(subtask && { subtask }),
    ...(nanoSubtask && { nanoSubtask })
  };

  // Title change
  if (oldEntity.title !== newEntity.title) {
    activities.push({
      ...baseActivity,
      type: 'title_changed',
      description: `Changed title from "${oldEntity.title}" to "${newEntity.title}"`,
      metadata: { oldTitle: oldEntity.title, newTitle: newEntity.title }
    });
  }

  // Status change
  if (oldEntity.status !== newEntity.status) {
    activities.push({
      ...baseActivity,
      type: 'status_changed',
      description: `Changed status from "${oldEntity.status}" to "${newEntity.status}"`,
      metadata: { oldStatus: oldEntity.status, newStatus: newEntity.status }
    });
  }

  // Priority change
  if (oldEntity.priority !== newEntity.priority) {
    activities.push({
      ...baseActivity,
      type: 'priority_changed',
      description: `Changed priority from "${oldEntity.priority}" to "${newEntity.priority}"`,
      metadata: { oldPriority: oldEntity.priority, newPriority: newEntity.priority }
    });
  }

  // Description change
  if (oldEntity.description !== newEntity.description) {
    activities.push({
      ...baseActivity,
      type: 'description_changed',
      description: 'Updated the description',
      metadata: { hasDescription: !!newEntity.description }
    });
  }

  // Due date change
  const oldDue = oldEntity.dueDate?.toString();
  const newDue = newEntity.dueDate?.toString();
  if (oldDue !== newDue) {
    activities.push({
      ...baseActivity,
      type: 'due_date_changed',
      description: newEntity.dueDate 
        ? `Changed due date to ${new Date(newEntity.dueDate).toLocaleDateString()}`
        : 'Removed due date',
      metadata: { oldDate: oldEntity.dueDate, newDate: newEntity.dueDate }
    });
  }

  // Assignees change
  const oldAssignees = (oldEntity.assignees || []).map(a => a.toString()).sort().join(',');
  const newAssignees = (newEntity.assignees || []).map(a => a.toString()).sort().join(',');
  if (oldAssignees !== newAssignees) {
    activities.push({
      ...baseActivity,
      type: 'member_added',
      description: 'Updated assignees',
      metadata: { changeType: 'assignees_updated' }
    });
  }

  // Logged time change
  const oldLoggedCount = (oldEntity.loggedTime || []).length;
  const newLoggedCount = (newEntity.loggedTime || []).length;
  if (newLoggedCount > oldLoggedCount) {
    const lastEntry = newEntity.loggedTime[newEntity.loggedTime.length - 1];
    activities.push({
      ...baseActivity,
      type: 'time_logged',
      description: `Logged ${lastEntry.hours}h ${lastEntry.minutes}m of work`,
      metadata: {
        hours: lastEntry.hours,
        minutes: lastEntry.minutes,
        description: lastEntry.description
      }
    });
  }

  // Estimation time change
  const oldEstCount = (oldEntity.estimationTime || []).length;
  const newEstCount = (newEntity.estimationTime || []).length;
  if (newEstCount > oldEstCount) {
    const lastEntry = newEntity.estimationTime[newEntity.estimationTime.length - 1];
    activities.push({
      ...baseActivity,
      type: 'estimation_updated',
      description: `Updated estimation to ${lastEntry.hours}h ${lastEntry.minutes}m`,
      metadata: {
        hours: lastEntry.hours,
        minutes: lastEntry.minutes,
        reason: lastEntry.reason
      }
    });
  }

  return activities;
};

/**
 * Executes background tasks without blocking the response
 * @param {Array} tasks - Array of promises or async functions to execute
 */
export const executeBackgroundTasks = (tasks) => {
  // Use setImmediate to move execution to next event loop iteration
  setImmediate(async () => {
    try {
      await Promise.allSettled(tasks.map(task => 
        typeof task === 'function' ? task() : task
      ));
    } catch (error) {
      console.error('Background task execution error:', error);
    }
  });
};

export default {
  batchCreateActivities,
  detectChangesAndGenerateActivities,
  executeBackgroundTasks
};

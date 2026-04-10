/**
 * Queue Name Registry
 *
 * Single source of truth for all BullMQ queue names.
 * Import from here to avoid typos and enable easy renaming.
 */
export const QUEUES = {
  EMAIL: 'flowtask.email',
  NOTIFICATION: 'flowtask.notification',
  ACTIVITY: 'flowtask.activity',
  ANNOUNCEMENT: 'flowtask.announcement',
  RECURRING_TASK: 'flowtask.recurring-task',
  CLEANUP: 'flowtask.cleanup',
  SLACK: 'flowtask.slack',
};

/**
 * Concurrency per queue (workers will pick this up).
 */
export const CONCURRENCY = {
  [QUEUES.EMAIL]: 5,
  [QUEUES.NOTIFICATION]: 10,
  [QUEUES.ACTIVITY]: 3,
  [QUEUES.ANNOUNCEMENT]: 2,
  [QUEUES.RECURRING_TASK]: 3,
  [QUEUES.CLEANUP]: 1,
  [QUEUES.SLACK]: 5,
};

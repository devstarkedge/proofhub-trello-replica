/**
 * Centralized notification-type metadata: which types bypass Quiet Hours
 * (criticality) and which types are eligible for Minimum Priority Level
 * filtering. Both were previously implicit/duplicated inline (see
 * SlackNotificationService.js's quiet-hours check and SlackUser's priority
 * check) — this module names them once so producers and the decision engine
 * agree on the same rules.
 *
 * Criticality is a notification-severity concept, deliberately independent
 * from task priority (a 'low' priority task can still be an urgent
 * assignment; a 'critical' priority task's routine status change is not).
 */

// Preserves the exact bypass set already hardcoded in
// SlackNotificationService.js today (task_assigned, comment_mention,
// announcement_created) — this centralizes existing shipped behavior, it
// does not introduce new product policy. task_overdue is added because an
// overdue alert is inherently time-sensitive/actionable in the same way.
export const CRITICALITY = {
  task_assigned: 'critical',
  comment_mention: 'critical',
  announcement_created: 'critical',
  task_overdue: 'critical',

  task_updated: 'non-critical',
  task_completed: 'non-critical',
  status_change: 'non-critical',
  task_deleted: 'non-critical',
  task_due_soon: 'non-critical',
  comment_added: 'non-critical',
  subtask_updated: 'non-critical',
  subtask_completed: 'non-critical',
  project_created: 'non-critical',
  project_updated: 'non-critical',
  project_updates: 'non-critical',
  team_member_added: 'non-critical',
  reminder: 'non-critical',
  reminder_due_soon: 'non-critical',
  digest_daily: 'non-critical',
  digest_weekly: 'non-critical'
};

export function isCriticalType(type) {
  return CRITICALITY[type] === 'critical';
}

// Types for which comparing against Minimum Priority Level is semantically
// valid (they carry a real task/board priority). Everything else (mentions,
// team updates, announcements, non-task project updates) must never be
// suppressed by a priority filter that doesn't apply to them.
export const PRIORITY_ELIGIBLE_TYPES = new Set([
  'task_assigned',
  'task_updated',
  'task_completed',
  'task_overdue',
  'task_due_soon',
  'status_change',
  'subtask_updated',
  'subtask_completed'
]);

export function isPriorityEligible(type) {
  return PRIORITY_ELIGIBLE_TYPES.has(type);
}

/**
 * Centralized task-priority ranking for notification filtering
 * (Minimum Priority Level in Slack Advanced settings, and any future
 * priority-gated notification channel).
 *
 * FlowTask's models mostly agree on ['low','medium','high','critical']
 * (Card, Subtask, SubtaskNano, RecurringTask, Notification, SlackNotification,
 * SlackUser.preferences.minPriorityLevel) — Board.priority is the sole
 * outlier, using 'urgent' as its top tier instead of 'critical'. Rather than
 * migrating Board's schema (out of scope for notification preferences),
 * 'urgent' is treated as an alias for 'critical' here so priority comparisons
 * behave consistently regardless of which model the event's priority came
 * from.
 */

export const PRIORITY_ORDER = ['low', 'medium', 'high', 'critical'];

export const PRIORITY_ALIASES = {
  urgent: 'critical'
};

/**
 * Normalizes a raw priority value (possibly null/undefined/'urgent'/mixed
 * case) to one of PRIORITY_ORDER, or null if it can't be recognized.
 */
export function normalizePriority(raw) {
  if (raw == null) return null;
  const lower = String(raw).toLowerCase().trim();
  const aliased = PRIORITY_ALIASES[lower] || lower;
  return PRIORITY_ORDER.includes(aliased) ? aliased : null;
}

/**
 * Returns true if `rawPriority` meets or exceeds `minLevel`.
 * - minLevel === 'all' (or unset/unrecognized) → always true, no filtering.
 * - rawPriority that can't be normalized (missing/unknown) → true (fail
 *   open; a priority-eligible event with no usable priority should not be
 *   silently dropped by a priority filter it can't evaluate).
 */
export function meetsMinimumPriority(rawPriority, minLevel) {
  const normalizedMin = normalizePriority(minLevel);
  if (!minLevel || minLevel === 'all' || !normalizedMin) return true;

  const priority = normalizePriority(rawPriority);
  if (!priority) return true;

  return PRIORITY_ORDER.indexOf(priority) >= PRIORITY_ORDER.indexOf(normalizedMin);
}

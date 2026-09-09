/**
 * SalesTab Validation
 *
 * Request body validation helpers for the SalesTab API.
 */

const VALID_ALERT_TYPES = [
  'new_row',
  'status_changed',
  'budget_increased',
  'rating_improved',
  'dead_to_active',
  'followup_overdue',
  'no_response_days',
];
const VALID_FREQUENCIES = ['instant', '15min', 'hourly', 'daily'];
const VALID_CHANNELS = ['in_app', 'notification_center', 'email'];
const VALID_PRIORITIES = ['low', 'medium', 'urgent'];
const VALID_VISIBILITIES = ['private', 'public'];
const MAX_NO_RESPONSE_DAYS = 365;

/**
 * Validate create/update tab body.
 * Returns { valid: boolean, errors: string[] }
 */
export function validateTabBody(body, existingTabNames = [], currentTabId = null) {
  const errors = [];

  // Name
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('Tab name is required');
    } else if (body.name.trim().length > 30) {
      errors.push('Tab name cannot exceed 30 characters');
    } else {
      const normalized = body.name.trim().toLowerCase();
      const duplicate = existingTabNames.find(
        (t) => t.name.toLowerCase() === normalized && String(t.id) !== String(currentTabId)
      );
      if (duplicate) {
        errors.push('A tab with this name already exists');
      }
    }
  }

  // Visibility
  if (body.visibility !== undefined && !VALID_VISIBILITIES.includes(body.visibility)) {
    errors.push(`visibility must be one of: ${VALID_VISIBILITIES.join(', ')}`);
  }

  // Alert rules
  if (body.alertRules !== undefined) {
    if (!Array.isArray(body.alertRules)) {
      errors.push('alertRules must be an array');
    } else {
      body.alertRules.forEach((rule, i) => {
        if (!rule.type || !VALID_ALERT_TYPES.includes(rule.type)) {
          errors.push(`alertRules[${i}].type must be one of: ${VALID_ALERT_TYPES.join(', ')}`);
        }
      });
    }
  }

  // Alert frequency
  if (body.alertFrequency !== undefined && !VALID_FREQUENCIES.includes(body.alertFrequency)) {
    errors.push(`alertFrequency must be one of: ${VALID_FREQUENCIES.join(', ')}`);
  }

  // Alert channels
  if (body.alertChannels !== undefined) {
    if (!Array.isArray(body.alertChannels)) {
      errors.push('alertChannels must be an array');
    } else {
      body.alertChannels.forEach((ch, i) => {
        if (!VALID_CHANNELS.includes(ch)) {
          errors.push(`alertChannels[${i}] must be one of: ${VALID_CHANNELS.join(', ')}`);
        }
      });
    }
  }

  // Alert priority
  if (body.alertPriority !== undefined && !VALID_PRIORITIES.includes(body.alertPriority)) {
    errors.push(`alertPriority must be one of: ${VALID_PRIORITIES.join(', ')}`);
  }

  // When Watch Tab Alerts is being turned on, require a complete,
  // deliverable configuration. When it's off, no further checks — the
  // tab's previously-saved alert config (if any) is preserved as-is,
  // inert until watch is re-enabled.
  if (body.isWatchTab === true) {
    if (!Array.isArray(body.alertRules) || body.alertRules.length === 0) {
      errors.push('Select at least one alert condition.');
    }
    if (!Array.isArray(body.alertChannels) || body.alertChannels.length === 0) {
      errors.push('Select at least one delivery method.');
    }

    const noResponseRule = (body.alertRules || []).find((r) => r && r.type === 'no_response_days');
    if (noResponseRule) {
      const days = noResponseRule.config?.days;
      if (!Number.isInteger(days) || days < 1 || days > MAX_NO_RESPONSE_DAYS) {
        errors.push(`Enter a valid number of days (1-${MAX_NO_RESPONSE_DAYS}).`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Sanitize tab body — strip unexpected fields.
 */
export function sanitizeTabBody(body) {
  const allowed = [
    'name', 'filters', 'columns', 'sorting', 'search', 'density',
    'frozenColumns', 'visibility', 'isPinned', 'displayOrder',
    'isWatchTab', 'alertRules', 'alertFrequency', 'alertChannels', 'alertPriority',
  ];
  const clean = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      clean[key] = body[key];
    }
  }
  return clean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OCCURRENCE_LABELS = { FIRST: '1st', SECOND: '2nd', THIRD: '3rd', FOURTH: '4th', FIFTH: '5th', LAST: 'Last' };

function dayLabel(day) {
  if (!day) return 'Off';
  if (day.isHalfWorkingDay) return 'Half day';
  return day.isWorkingDay ? 'Working' : 'Off';
}

function ruleLabel(rule) {
  return `${OCCURRENCE_LABELS[rule.occurrence] || rule.occurrence} ${DAY_NAMES[rule.dayOfWeek]} = ${rule.action === 'WORKING' ? 'Working' : 'Off'}`;
}

function overrideLabel(override) {
  return `${override.date}: ${override.type === 'WORKING_OVERRIDE' ? 'Special Working Day' : 'Special Off Day'} (${override.reason})`;
}

/**
 * Old (server-loaded) vs. new (draft) — used both to show the
 * confirmation diff before saving and to decide whether there's anything
 * to save at all (an edit with zero differences never calls the API).
 * Mirrors leavePolicyDiff.js's shape exactly ({label, oldValue, newValue} rows).
 */
export function buildWorkCalendarDiff({ serverConfig, draft }) {
  const rows = [];
  const oldPattern = serverConfig?.workCalendar?.weeklyPattern || [];
  const oldByDay = new Map(oldPattern.map((d) => [d.dayOfWeek, d]));

  for (const day of draft.weeklyPattern) {
    const oldDay = oldByDay.get(day.dayOfWeek);
    if (dayLabel(oldDay) !== dayLabel(day)) {
      rows.push({ label: DAY_NAMES[day.dayOfWeek], oldValue: dayLabel(oldDay), newValue: dayLabel(day) });
    }
  }

  const oldMinutes = serverConfig?.workCalendar?.standardWorkMinutesPerDay ?? 480;
  if (oldMinutes !== draft.standardWorkMinutesPerDay) {
    rows.push({ label: 'Standard work minutes/day', oldValue: String(oldMinutes), newValue: String(draft.standardWorkMinutesPerDay) });
  }

  const oldRuleKeys = new Set((serverConfig?.recurringRules || []).map((r) => `${r.dayOfWeek}:${r.occurrence}:${r.action}`));
  const newRuleKeys = new Set(draft.recurringRules.map((r) => `${r.dayOfWeek}:${r.occurrence}:${r.action}`));
  for (const rule of serverConfig?.recurringRules || []) {
    if (!newRuleKeys.has(`${rule.dayOfWeek}:${rule.occurrence}:${rule.action}`)) {
      rows.push({ label: 'Recurring rule removed', oldValue: ruleLabel(rule), newValue: '—' });
    }
  }
  for (const rule of draft.recurringRules) {
    if (!oldRuleKeys.has(`${rule.dayOfWeek}:${rule.occurrence}:${rule.action}`)) {
      rows.push({ label: 'Recurring rule added', oldValue: '—', newValue: ruleLabel(rule) });
    }
  }

  const oldOverrideByDate = new Map((serverConfig?.dateOverrides || []).map((o) => [String(o.date).slice(0, 10), o]));
  const newOverrideByDate = new Map(draft.dateOverrides.map((o) => [o.date, o]));
  for (const [date, override] of oldOverrideByDate) {
    if (!newOverrideByDate.has(date)) rows.push({ label: 'Date override removed', oldValue: overrideLabel({ ...override, date }), newValue: '—' });
  }
  for (const [date, override] of newOverrideByDate) {
    const old = oldOverrideByDate.get(date);
    if (!old || old.type !== override.type || old.reason !== override.reason) {
      rows.push({ label: old ? 'Date override changed' : 'Date override added', oldValue: old ? overrideLabel({ ...old, date }) : '—', newValue: overrideLabel(override) });
    }
  }

  return rows;
}

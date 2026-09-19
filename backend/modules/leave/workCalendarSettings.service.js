import mongoose from 'mongoose';
import WorkCalendar from './workCalendar.model.js';
import WorkCalendarRule from './workCalendarRule.model.js';
import WorkCalendarDateOverride from './workCalendarDateOverride.model.js';
import Holiday from './holiday.model.js';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, dateOnlyToInstant, eachCalendarDate, instantToDateOnlyKey } from './leaveTimezone.util.js';
import { buildContextFromRows, classifyDateWithContext } from './leaveCalendar.service.js';

const VALID_OCCURRENCES = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'LAST'];
const VALID_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

/**
 * Everything the Work Calendar Settings page reads/writes as one unit —
 * base pattern, recurring rules, date overrides — always scoped to this
 * one workspace's workspace-wide calendar (per-department recurring
 * rules/overrides are out of scope for this pass; the base pattern keeps
 * its own existing department-override capability, read separately by
 * the Leave Settings "department calendar" flows this file doesn't touch).
 */
export async function getWorkCalendarConfiguration({ workspaceId }) {
  const [workCalendar, recurringRules, dateOverrides] = await Promise.all([
    WorkCalendar.findOne({ workspaceId, scope: 'workspace', isActive: true }).sort({ effectiveFrom: -1 }).lean(),
    WorkCalendarRule.find({ workspaceId, isActive: true }).sort({ dayOfWeek: 1, occurrence: 1 }).lean(),
    WorkCalendarDateOverride.find({ workspaceId }).sort({ date: 1 }).lean()
  ]);
  return { workCalendar, recurringRules, dateOverrides };
}

function assertValidWeeklyPattern(weeklyPattern) {
  if (!Array.isArray(weeklyPattern) || weeklyPattern.length !== 7) {
    throw new ErrorResponse('A complete 7-day weekly pattern is required', 400);
  }
  for (const day of weeklyPattern) {
    if (!VALID_DAYS_OF_WEEK.includes(day.dayOfWeek)) throw new ErrorResponse('The weekly pattern contains an invalid weekday', 400);
  }
  if (!weeklyPattern.some((day) => day.isWorkingDay)) {
    throw new ErrorResponse('At least one working day must be configured', 400);
  }
}

function assertValidRecurringRules(rules) {
  if (!Array.isArray(rules)) throw new ErrorResponse('Recurring rules must be a list', 400);
  const seenExact = new Set();
  const occurrencesByDay = new Map();
  for (const rule of rules) {
    if (!VALID_DAYS_OF_WEEK.includes(rule.dayOfWeek)) throw new ErrorResponse('A recurring rule has an invalid weekday', 400);
    if (!VALID_OCCURRENCES.includes(rule.occurrence)) throw new ErrorResponse('A recurring rule has an invalid occurrence (must be 1st-5th or Last)', 400);
    if (!['WORKING', 'OFF'].includes(rule.action)) throw new ErrorResponse('A recurring rule must be either Working or Off', 400);

    const exactKey = `${rule.dayOfWeek}:${rule.occurrence}`;
    if (seenExact.has(exactKey)) throw new ErrorResponse('This recurring rule already exists — remove the duplicate before saving', 400);
    seenExact.add(exactKey);

    const set = occurrencesByDay.get(rule.dayOfWeek) || new Set();
    set.add(rule.occurrence);
    occurrencesByDay.set(rule.dayOfWeek, set);
  }
  // FIFTH and LAST can name the exact same real date in a 5-occurrence
  // month — configuring both for one weekday is inherently ambiguous, not
  // just "resolvable by priority," so it's rejected outright rather than
  // silently letting one win.
  for (const [, occurrences] of occurrencesByDay) {
    if (occurrences.has('FIFTH') && occurrences.has('LAST')) {
      throw new ErrorResponse('A weekday can\'t have both a "5th" and a "Last" rule — they can refer to the same date and conflict. Remove one.', 400);
    }
  }
}

function assertValidDateOverrides(overrides) {
  if (!Array.isArray(overrides)) throw new ErrorResponse('Date overrides must be a list', 400);
  const seen = new Set();
  for (const override of overrides) {
    if (!override.date) throw new ErrorResponse('Each date override needs a date', 400);
    if (!['WORKING_OVERRIDE', 'OFF_OVERRIDE'].includes(override.type)) {
      throw new ErrorResponse('A date override must be either a Working or Off override', 400);
    }
    if (!override.reason || !String(override.reason).trim()) {
      throw new ErrorResponse('Each date override needs a short reason', 400);
    }
    const key = String(override.date).slice(0, 10);
    if (seen.has(key)) throw new ErrorResponse('This date already has an override configured — remove the duplicate before saving', 400);
    seen.add(key);
  }
}

function hasBasePatternChanged(currentCalendar, weeklyPattern, standardWorkMinutesPerDay) {
  if (!currentCalendar) return true;
  const currentByDay = new Map(currentCalendar.weeklyPattern.map((d) => [d.dayOfWeek, d]));
  const patternChanged = weeklyPattern.some((day) => {
    const existing = currentByDay.get(day.dayOfWeek);
    return !existing || existing.isWorkingDay !== day.isWorkingDay || Boolean(existing.isHalfWorkingDay) !== Boolean(day.isHalfWorkingDay);
  });
  const minutesChanged = (currentCalendar.standardWorkMinutesPerDay ?? 480) !== (standardWorkMinutesPerDay ?? 480);
  return patternChanged || minutesChanged;
}

/**
 * The one atomic "Save Work Calendar" operation — base pattern (a new
 * WorkCalendar version only if it actually changed, preserving its
 * existing append-only versioning) + a full replace of the recurring
 * rules and date overrides, validated together, in one transaction.
 * Returns { before, after } so the caller can audit-log/emit exactly what
 * changed; never mutates a pre-existing WorkCalendar row in place.
 */
export async function saveWorkCalendarConfiguration({
  workspaceId, effectiveFrom, weeklyPattern, standardWorkMinutesPerDay, recurringRules = [], dateOverrides = [], createdBy
}) {
  assertValidWeeklyPattern(weeklyPattern);
  assertValidRecurringRules(recurringRules);
  assertValidDateOverrides(dateOverrides);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const before = await getWorkCalendarConfiguration({ workspaceId });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (hasBasePatternChanged(before.workCalendar, weeklyPattern, standardWorkMinutesPerDay)) {
        await WorkCalendar.create([{
          workspaceId, scope: 'workspace', weeklyPattern, standardWorkMinutesPerDay,
          effectiveFrom: effectiveFrom ? dateOnlyToInstant(effectiveFrom, timezone) : new Date(),
          isActive: true, createdBy
        }], { session });
      }

      // Recurring rules / date overrides carry no downstream references
      // from any other collection (unlike LeavePolicyVersion, which
      // LeaveRequestDay/buckets point at directly) — a full replace inside
      // one transaction is simpler than a surgical per-row diff and
      // exactly as safe, since nothing outside this save can ever observe
      // a half-replaced state.
      await WorkCalendarRule.deleteMany({ workspaceId }, { session });
      if (recurringRules.length) {
        await WorkCalendarRule.create(
          recurringRules.map((rule) => ({
            workspaceId, dayOfWeek: rule.dayOfWeek, occurrence: rule.occurrence, action: rule.action,
            label: rule.label || '', createdBy
          })),
          { session }
        );
      }

      await WorkCalendarDateOverride.deleteMany({ workspaceId }, { session });
      if (dateOverrides.length) {
        await WorkCalendarDateOverride.create(
          dateOverrides.map((override) => ({
            workspaceId, date: dateOnlyToInstant(override.date, timezone), type: override.type,
            reason: override.reason, isHalfDay: Boolean(override.isHalfDay), createdBy
          })),
          { session }
        );
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ErrorResponse('Unable to update Work Calendar because the configuration contains conflicting rules.', 400);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const after = await getWorkCalendarConfiguration({ workspaceId });
  return { before, after };
}

/**
 * Dry-run: classifies one month against a DRAFT configuration (not yet
 * saved) so the Settings page's preview calendar can show exactly what
 * Save will produce, without writing anything. Holidays are read from the
 * real database (they're managed on a separate tab, not part of this
 * draft) and merged with the draft's base pattern/rules/overrides through
 * the exact same classifyDateWithContext precedence chain a real save
 * would use — never a separate reimplementation.
 */
export async function previewWorkCalendarConfiguration({
  workspaceId, year, month, weeklyPattern, standardWorkMinutesPerDay, recurringRules = [], dateOverrides = []
}) {
  assertValidWeeklyPattern(weeklyPattern);
  assertValidRecurringRules(recurringRules);
  assertValidDateOverrides(dateOverrides);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const holidays = await Holiday.find({}).lean();

  const context = buildContextFromRows({
    timezone,
    holidays,
    workspaceCalendars: [{ effectiveFrom: new Date(0), weeklyPattern, standardWorkMinutesPerDay }],
    departmentCalendars: [],
    recurringRules,
    dateOverrides: dateOverrides.map((override) => ({ ...override, date: dateOnlyToInstant(override.date, timezone) }))
  });

  const monthStart = dateOnlyToInstant(`${year}-${String(month).padStart(2, '0')}-01`, timezone);
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = dateOnlyToInstant(`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`, timezone);

  const days = [];
  for (const date of eachCalendarDate(monthStart, monthEnd, timezone)) {
    days.push({ date: instantToDateOnlyKey(date, timezone), ...classifyDateWithContext(context, date) });
  }
  return { timezone, days };
}

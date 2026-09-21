import { DateTime } from 'luxon';
import AttendanceWorkModeOverride from './attendanceWorkModeOverride.model.js';
import AttendanceWorkModeScheduleRule from './attendanceWorkModeScheduleRule.model.js';
import AttendanceWorkModeDateOverride from './attendanceWorkModeDateOverride.model.js';
import Department from '../../models/Department.js';
import Role from '../../models/Role.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { occurrenceOf, getWorkspaceTimezone, eachCalendarDate } from '../leave/leaveTimezone.util.js';

/**
 * The single centralized Work Mode override resolver — every caller that
 * needs "what work modes can this person use today" goes through
 * resolveEffectiveWorkModePolicy, never re-derives the USER > DEPARTMENT >
 * ROLE > WORKSPACE-DEFAULT precedence itself. Mirrors
 * attendanceShiftResolver.service.js's resolution style exactly (same
 * specificity + priority + most-recent-effectiveFrom sort), extended with
 * one extra deterministic tiebreak for the case a user belongs to several
 * departments that each have their own active override.
 */

const SPECIFICITY_RANK = { USER: 3, DEPARTMENT: 2, ROLE: 1 };

/** membership.roleId is expected to be populated at membership-creation time for every real member; this is the documented fallback for a membership predating that, or a test fixture that only set the plain role string. */
async function resolveEffectiveRoleId({ workspaceId, membership }) {
  if (membership?.roleId) return membership.roleId;
  if (!membership?.role) return null;
  const role = await Role.findResolvable(membership.role, workspaceId);
  return role?._id || null;
}

function defaultModeFallback(allowedWorkModes) {
  if (allowedWorkModes.length === 1) return allowedWorkModes[0];
  if (allowedWorkModes.includes('OFFICE')) return 'OFFICE';
  return allowedWorkModes[0];
}

async function scopeName(scopeType, scopeId) {
  if (scopeType === 'DEPARTMENT') return (await Department.findById(scopeId).select('name').lean())?.name || 'Unknown department';
  if (scopeType === 'ROLE') return (await Role.findById(scopeId).select('name').lean())?.name || 'Unknown role';
  if (scopeType === 'USER') return 'This person specifically';
  return 'Workspace Default';
}

/** Real Date#getDay() convention (0=Sun..6=Sat), computed in the workspace timezone — never UTC's own day boundary. */
function jsDayOfWeek(date, timezone) {
  return DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: 'utc' }).setZone(timezone).weekday % 7;
}

/**
 * Resolves the specific mode a schedule-governed override dictates for
 * exactly this business date (spec §5-6, §11-14): an exact date override
 * beats a recurring rule, a specific-occurrence rule (e.g. THIRD Friday)
 * beats an EVERY rule for the same weekday, and the override's own static
 * defaultMode is the final fallback when nothing scheduled matches today.
 * Returns null (not schedule-governed) only when the override has
 * neither rules nor date overrides configured at all — the caller then
 * falls back to the override's plain flat allowedModes/defaultMode
 * behavior unchanged.
 */
async function resolveScheduledMode({ workspaceId, override, date, timezone }) {
  const [ruleCount, dateOverride] = await Promise.all([
    AttendanceWorkModeScheduleRule.countDocuments({ workspaceId, override: override._id, isActive: true }),
    AttendanceWorkModeDateOverride.findOne({ workspaceId, override: override._id, date, isActive: true }).lean()
  ]);
  if (!ruleCount && !dateOverride) return null; // not schedule-governed at all

  if (dateOverride) return dateOverride.mode;

  const dayOfWeek = jsDayOfWeek(date, timezone);
  const rules = await AttendanceWorkModeScheduleRule.find({ workspaceId, override: override._id, dayOfWeek, isActive: true }).lean();
  if (rules.length) {
    const { occurrence, isLast } = occurrenceOf(date, timezone);
    const specific = rules.find((r) => r.occurrence === occurrence) || (isLast ? rules.find((r) => r.occurrence === 'LAST') : null);
    const winner = specific || rules.find((r) => r.occurrence === 'EVERY');
    if (winner) return winner.mode;
  }

  return override.defaultMode; // schedule-governed, but no rule names today — the override's own default is the fallback
}

/**
 * `date`: the business date (a real Date instant) this resolution applies
 * to — future-scheduled overrides never apply early, and a later change
 * never reinterprets a historical date (spec §10). `timezone` is required
 * whenever the winning override is schedule-governed (day-of-week/
 * occurrence math is meaningless without it) — callers always have it in
 * scope already (see attendanceWorkMode.service.js#resolveAuthorizedWorkMode).
 */
export async function resolveEffectiveWorkModePolicy({ workspaceId, userId, membership, policyVersion, date = new Date(), timezone = 'UTC' }) {
  const roleId = await resolveEffectiveRoleId({ workspaceId, membership });
  const departmentIds = (membership?.department || []).map(String);

  const candidates = await AttendanceWorkModeOverride.find({
    workspaceId, isActive: true, effectiveFrom: { $lte: date },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: date } }]
  }).lean();

  const matching = candidates.filter((o) => {
    if (o.scopeType === 'USER') return String(o.scopeId) === String(userId);
    if (o.scopeType === 'DEPARTMENT') return departmentIds.includes(String(o.scopeId));
    if (o.scopeType === 'ROLE') return roleId && String(o.scopeId) === String(roleId);
    return false; // WORKSPACE-scoped rows are never matched here — see model file's own note
  });

  if (matching.length) {
    const departmentOrder = new Map(departmentIds.map((id, index) => [id, index]));
    matching.sort((a, b) => {
      const rankDiff = SPECIFICITY_RANK[b.scopeType] - SPECIFICITY_RANK[a.scopeType];
      if (rankDiff !== 0) return rankDiff;
      if (b.priority !== a.priority) return b.priority - a.priority;
      const timeDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
      if (timeDiff !== 0) return timeDiff;
      // Only reachable when both are DEPARTMENT-scoped (USER/ROLE can never
      // tie against another row of the same scope, since a person has at
      // most one matching USER row and one resolved role) — the earliest
      // department in the membership's own array wins, a deterministic,
      // pre-existing FlowTask convention (see attendance.service.js's own
      // primaryDepartmentId helper), never a random/first-returned pick.
      return (departmentOrder.get(String(a.scopeId)) ?? Infinity) - (departmentOrder.get(String(b.scopeId)) ?? Infinity);
    });

    const winner = matching[0];
    const source = { scopeType: winner.scopeType, scopeId: winner.scopeId, scopeName: await scopeName(winner.scopeType, winner.scopeId) };

    const scheduledMode = await resolveScheduledMode({ workspaceId, override: winner, date, timezone });
    if (scheduledMode) {
      // Schedule-governed: the resolved mode for THIS date is the only
      // one on offer — never a set the employee can pick among (spec §11:
      // "Do NOT allow the user to manually switch... The backend resolves
      // the authorized mode"). This also means attendanceWorkMode.service.js's
      // existing requestedWorkMode validation automatically rejects any
      // mismatched client request with zero extra code, since it already
      // checks requestedWorkMode against allowedWorkModes.
      return { allowedWorkModes: [scheduledMode], defaultMode: scheduledMode, source };
    }

    return {
      allowedWorkModes: winner.allowedModes, defaultMode: winner.defaultMode, source
    };
  }

  const allowedWorkModes = policyVersion?.allowedWorkModes?.length ? policyVersion.allowedWorkModes : ['OFFICE'];
  return {
    allowedWorkModes, defaultMode: defaultModeFallback(allowedWorkModes),
    source: { scopeType: 'WORKSPACE', scopeId: null, scopeName: 'Workspace Default' }
  };
}

// ─── Settings CRUD ──────────────────────────────────────────────────────────

export async function listOverrides({ workspaceId }) {
  const overrides = await AttendanceWorkModeOverride.find({ workspaceId, isActive: true }).sort({ scopeType: 1, priority: -1 }).lean();
  const withNames = await Promise.all(overrides.map(async (o) => ({ ...o, scopeName: await scopeName(o.scopeType, o.scopeId) })));
  return withNames;
}

export async function getOverrideById({ workspaceId, overrideId }) {
  return AttendanceWorkModeOverride.findOne({ _id: overrideId, workspaceId }).lean();
}

export async function getOverrideHistory({ workspaceId, scopeType, scopeId }) {
  return AttendanceWorkModeOverride.find({ workspaceId, scopeType, scopeId: scopeId || null }).sort({ effectiveFrom: -1 }).lean();
}

function assertValidModes(allowedModes, defaultMode) {
  if (!Array.isArray(allowedModes) || !allowedModes.length) throw new ErrorResponse('At least one allowed work mode is required', 400);
  if (!allowedModes.includes(defaultMode)) throw new ErrorResponse('The default mode must be one of the allowed modes', 400);
}

async function assertScopeBelongsToWorkspace({ workspaceId, scopeType, scopeId }) {
  if (scopeType === 'DEPARTMENT') {
    const department = await Department.findOne({ _id: scopeId, workspaceId }).lean();
    if (!department) throw new ErrorResponse('Department not found in this workspace', 404);
  } else if (scopeType === 'ROLE') {
    const role = await Role.findOne({ _id: scopeId, $or: [{ workspaceId }, { workspaceId: null, isSystem: true }] }).lean();
    if (!role) throw new ErrorResponse('Role not found in this workspace', 404);
  } else if (scopeType === 'USER') {
    const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: scopeId, status: 'active' }).lean();
    if (!membership) throw new ErrorResponse('User is not an active member of this workspace', 404);
  }
}

export async function createOverride({ workspaceId, scopeType, scopeId, allowedModes, defaultMode, priority = 0, effectiveFrom, effectiveUntil = null, createdBy }) {
  if (!['ROLE', 'DEPARTMENT', 'USER'].includes(scopeType)) throw new ErrorResponse('scopeType must be ROLE, DEPARTMENT, or USER', 400);
  if (!scopeId) throw new ErrorResponse('scopeId is required', 400);
  assertValidModes(allowedModes, defaultMode);
  await assertScopeBelongsToWorkspace({ workspaceId, scopeType, scopeId });

  // Never trust the client's workspaceId for the SCOPE itself; each check
  // above already re-validates scopeId belongs to workspaceId — this
  // final active-conflict guard prevents duplicate concurrent rows for
  // the exact same scope+effective-period without needing versioning
  // ceremony (spec §9).
  const overlapping = await AttendanceWorkModeOverride.findOne({
    workspaceId, scopeType, scopeId, isActive: true,
    effectiveFrom: { $lte: effectiveUntil || new Date('9999-12-31') },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: effectiveFrom } }]
  }).lean();
  if (overlapping) throw new ErrorResponse('An active override already exists for this scope during an overlapping period. Deactivate it first or adjust the effective dates.', 400);

  return AttendanceWorkModeOverride.create({ workspaceId, scopeType, scopeId, allowedModes, defaultMode, priority, effectiveFrom, effectiveUntil, isActive: true, createdBy, updatedBy: createdBy });
}

export async function updateOverride({ workspaceId, overrideId, updates, updatedBy }) {
  const override = await AttendanceWorkModeOverride.findOne({ _id: overrideId, workspaceId });
  if (!override) throw new ErrorResponse('Override not found', 404);

  const allowedModes = updates.allowedModes ?? override.allowedModes;
  const defaultMode = updates.defaultMode ?? override.defaultMode;
  assertValidModes(allowedModes, defaultMode);

  override.allowedModes = allowedModes;
  override.defaultMode = defaultMode;
  if (updates.priority !== undefined) override.priority = updates.priority;
  if (updates.effectiveFrom !== undefined) override.effectiveFrom = updates.effectiveFrom;
  if (updates.effectiveUntil !== undefined) override.effectiveUntil = updates.effectiveUntil;
  override.updatedBy = updatedBy;
  await override.save();
  return override;
}

export async function deactivateOverride({ workspaceId, overrideId, updatedBy }) {
  const override = await AttendanceWorkModeOverride.findOneAndUpdate(
    { _id: overrideId, workspaceId }, { $set: { isActive: false, updatedBy } }, { new: true }
  );
  if (!override) throw new ErrorResponse('Override not found', 404);
  return override;
}

// ─── Schedule CRUD (spec §5-6, §11-14) ─────────────────────────────────────
// Both attach to one specific AttendanceWorkModeOverride, letting a
// USER/DEPARTMENT/ROLE override optionally say "the allowed mode(s) here
// actually vary by day" instead of being one flat set — see
// resolveScheduledMode above for how these are read back.

async function loadOverrideOrThrow({ workspaceId, overrideId }) {
  const override = await AttendanceWorkModeOverride.findOne({ _id: overrideId, workspaceId, isActive: true }).lean();
  if (!override) throw new ErrorResponse('Work mode override not found or inactive', 404);
  return override;
}

function assertModeAllowedByOverride(override, mode) {
  if (!override.allowedModes.includes(mode)) {
    throw new ErrorResponse(`"${mode}" is not one of this override's allowed modes (${override.allowedModes.join(', ')})`, 400);
  }
}

export async function listScheduleRules({ workspaceId, overrideId }) {
  return AttendanceWorkModeScheduleRule.find({ workspaceId, override: overrideId, isActive: true }).sort({ dayOfWeek: 1, occurrence: 1 }).lean();
}

export async function createScheduleRule({ workspaceId, overrideId, dayOfWeek, occurrence = 'EVERY', mode, createdBy }) {
  const override = await loadOverrideOrThrow({ workspaceId, overrideId });
  assertModeAllowedByOverride(override, mode);
  if (dayOfWeek < 0 || dayOfWeek > 6) throw new ErrorResponse('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)', 400);

  const existing = await AttendanceWorkModeScheduleRule.findOne({ workspaceId, override: overrideId, dayOfWeek, occurrence, isActive: true }).lean();
  if (existing) throw new ErrorResponse('A rule for this day/occurrence combination already exists for this override', 400);

  return AttendanceWorkModeScheduleRule.create({ workspaceId, override: overrideId, dayOfWeek, occurrence, mode, isActive: true, createdBy });
}

export async function deactivateScheduleRule({ workspaceId, ruleId }) {
  const rule = await AttendanceWorkModeScheduleRule.findOneAndUpdate(
    { _id: ruleId, workspaceId }, { $set: { isActive: false } }, { new: true }
  );
  if (!rule) throw new ErrorResponse('Schedule rule not found', 404);
  return rule;
}

export async function listDateOverrides({ workspaceId, overrideId }) {
  return AttendanceWorkModeDateOverride.find({ workspaceId, override: overrideId, isActive: true }).sort({ date: 1 }).lean();
}

/**
 * `startDate`/`endDate` ('YYYY-MM-DD' strings) — a single date is
 * startDate===endDate; a range expands into one row per date (spec §6's
 * "Date range: 2026-10-01 to 2026-12-31" example), never a stored range
 * field — matching workCalendarDateOverride's own one-row-per-date shape.
 */
export async function createDateOverrides({ workspaceId, overrideId, startDate, endDate, mode, createdBy }) {
  const override = await loadOverrideOrThrow({ workspaceId, overrideId });
  assertModeAllowedByOverride(override, mode);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const dates = Array.from(eachCalendarDate(startDate, endDate || startDate, timezone));
  if (!dates.length) throw new ErrorResponse('At least one date is required', 400);

  // Deliberately no `workspaceId` in the filter — workspaceScopePlugin's
  // findOneAndUpdate hook always ANDs one in from the active context
  // regardless of what's already there, so also putting it here would make
  // MongoDB's upsert insert-document inference see it matched twice and
  // reject the write (see attendanceMemberProfile.service.js#upsertAttendanceProfile
  // for the first time this exact bug was found and fixed this session).
  const created = [];
  for (const date of dates) {
    const row = await AttendanceWorkModeDateOverride.findOneAndUpdate(
      { override: overrideId, date },
      { $set: { mode, isActive: true, createdBy }, $setOnInsert: { workspaceId, override: overrideId, date } },
      { upsert: true, new: true, runValidators: true }
    );
    created.push(row);
  }
  return created;
}

export async function deactivateDateOverride({ workspaceId, dateOverrideId }) {
  const row = await AttendanceWorkModeDateOverride.findOneAndUpdate(
    { _id: dateOverrideId, workspaceId }, { $set: { isActive: false } }, { new: true }
  );
  if (!row) throw new ErrorResponse('Date override not found', 404);
  return row;
}

/** Every user this override's scope could affect — for realtime fan-out (spec §24), never a broad room. */
export async function resolveAffectedUserIds({ workspaceId, scopeType, scopeId }) {
  if (scopeType === 'USER') return [String(scopeId)];
  if (scopeType === 'DEPARTMENT') {
    const members = await WorkspaceMembership.find({ workspace: workspaceId, department: scopeId, status: 'active' }).select('user').lean();
    return members.map((m) => String(m.user));
  }
  if (scopeType === 'ROLE') {
    const role = await Role.findById(scopeId).select('slug').lean();
    const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active', $or: [{ roleId: scopeId }, ...(role?.slug ? [{ role: role.slug }] : [])] }).select('user').lean();
    return members.map((m) => String(m.user));
  }
  const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).select('user').lean();
  return members.map((m) => String(m.user));
}

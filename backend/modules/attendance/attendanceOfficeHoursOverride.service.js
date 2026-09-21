import AttendanceOfficeHoursOverride from './attendanceOfficeHoursOverride.model.js';
import Department from '../../models/Department.js';
import Role from '../../models/Role.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

/**
 * The single centralized Office Hours resolver (new spec §15-25, §43).
 * Every caller that needs "what start/end/grace/thresholds apply to this
 * person on this business date" goes through resolveEffectiveOfficeHours —
 * never re-derives the USER > DEPARTMENT > ROLE > SHIFT > WORKSPACE-POLICY
 * chain itself. Mirrors attendanceWorkModeOverride.service.js's resolution
 * style (same specificity + priority + most-recent-effectiveFrom sort,
 * same department-membership tiebreak) with one structural difference:
 * the winning override's OWN null fields fall through per-field to Shift
 * then Policy, rather than the whole row losing to a lower tier — see the
 * model file's own doc comment for why (spec §19's partial-override choice).
 */

const SPECIFICITY_RANK = { USER: 3, DEPARTMENT: 2, ROLE: 1 };
const OVERRIDABLE_FIELDS = ['startLocalTime', 'endLocalTime', 'graceMinutes', 'earlyExitGraceMinutes', 'minimumFullDayMinutes', 'minimumHalfDayMinutes'];
// Mirrors attendancePolicyVersion.model.js's own officeHoursSchema defaults exactly.
const DEFAULT_START_LOCAL_TIME = '09:00';
const DEFAULT_END_LOCAL_TIME = '18:00';

async function resolveEffectiveRoleId({ workspaceId, membership }) {
  if (membership?.roleId) return membership.roleId;
  if (!membership?.role) return null;
  const role = await Role.findResolvable(membership.role, workspaceId);
  return role?._id || null;
}

async function scopeName(scopeType, scopeId) {
  if (scopeType === 'DEPARTMENT') return (await Department.findById(scopeId).select('name').lean())?.name || 'Unknown department';
  if (scopeType === 'ROLE') return (await Role.findById(scopeId).select('name').lean())?.name || 'Unknown role';
  if (scopeType === 'USER') return 'This person specifically';
  return 'Workspace Default';
}

/** Highest-precedence matching override for (userId, date), or null — same algorithm as resolveEffectiveWorkModePolicy. */
async function resolveWinningOverride({ workspaceId, userId, membership, date }) {
  const roleId = await resolveEffectiveRoleId({ workspaceId, membership });
  const departmentIds = (membership?.department || []).map(String);

  const candidates = await AttendanceOfficeHoursOverride.find({
    workspaceId, isActive: true, effectiveFrom: { $lte: date },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: date } }]
  }).lean();

  const matching = candidates.filter((o) => {
    if (o.scopeType === 'USER') return String(o.scopeId) === String(userId);
    if (o.scopeType === 'DEPARTMENT') return departmentIds.includes(String(o.scopeId));
    if (o.scopeType === 'ROLE') return roleId && String(o.scopeId) === String(roleId);
    return false;
  });
  if (!matching.length) return null;

  const departmentOrder = new Map(departmentIds.map((id, index) => [id, index]));
  matching.sort((a, b) => {
    const rankDiff = SPECIFICITY_RANK[b.scopeType] - SPECIFICITY_RANK[a.scopeType];
    if (rankDiff !== 0) return rankDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    const timeDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    if (timeDiff !== 0) return timeDiff;
    return (departmentOrder.get(String(a.scopeId)) ?? Infinity) - (departmentOrder.get(String(b.scopeId)) ?? Infinity);
  });
  return matching[0];
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

/**
 * `date`/`timezone` describe the business date this resolution applies to
 * (never re-derived from "now" — a later override change must never
 * reinterpret a historical date, spec §23). `shift`/`policyVersion` are
 * resolved upstream by their own dedicated services and passed in — this
 * function never re-resolves either, keeping each concern owned by exactly
 * one file (same architecture as attendanceStatusResolver.service.js).
 */
export async function resolveEffectiveOfficeHours({ workspaceId, userId, membership, date, policyVersion, shift = null }) {
  const winner = await resolveWinningOverride({ workspaceId, userId, membership, date });

  const shiftValues = {
    startLocalTime: shift?.startLocalTime ?? null,
    endLocalTime: shift?.endLocalTime ?? null,
    graceMinutes: shift?.graceMinutes ?? null,
    earlyExitGraceMinutes: null, // AttendanceShift has no early-exit-grace override slot
    minimumFullDayMinutes: shift?.minimumFullDayMinutes ?? null,
    minimumHalfDayMinutes: shift?.minimumHalfDayMinutes ?? null
  };
  const policyValues = {
    // `?? DEFAULT_*` covers a policy version stored before this field
    // existed — a lean() read of a pre-migration document has no
    // officeHours subdocument at all, so the schema's own declared
    // default never gets a chance to apply (Mongoose only backfills
    // defaults for documents it hydrates/creates, not raw legacy reads).
    // Same values as the schema's own default, not a second hardcoded
    // business rule.
    startLocalTime: policyVersion.officeHours?.startLocalTime ?? DEFAULT_START_LOCAL_TIME,
    endLocalTime: policyVersion.officeHours?.endLocalTime ?? DEFAULT_END_LOCAL_TIME,
    graceMinutes: policyVersion.graceMinutes,
    earlyExitGraceMinutes: policyVersion.earlyExitGraceMinutes,
    minimumFullDayMinutes: policyVersion.minimumFullDayMinutes,
    minimumHalfDayMinutes: policyVersion.minimumHalfDayMinutes
  };

  const resolved = {};
  for (const field of OVERRIDABLE_FIELDS) {
    resolved[field] = firstDefined(winner?.[field], shiftValues[field], policyValues[field]);
  }

  const source = winner
    ? { scopeType: `${winner.scopeType}_OVERRIDE`, scopeId: winner.scopeId, scopeName: await scopeName(winner.scopeType, winner.scopeId) }
    : shift
      ? { scopeType: 'SHIFT', scopeId: shift._id, scopeName: shift.name }
      : { scopeType: 'WORKSPACE_POLICY', scopeId: null, scopeName: 'Workspace Default' };

  return { ...resolved, source: source.scopeType, sourceDetail: source };
}

// ─── Settings CRUD ──────────────────────────────────────────────────────────

export async function listOverrides({ workspaceId }) {
  const overrides = await AttendanceOfficeHoursOverride.find({ workspaceId, isActive: true }).sort({ scopeType: 1, priority: -1 }).lean();
  return Promise.all(overrides.map(async (o) => ({ ...o, scopeName: await scopeName(o.scopeType, o.scopeId) })));
}

export async function getOverrideById({ workspaceId, overrideId }) {
  return AttendanceOfficeHoursOverride.findOne({ _id: overrideId, workspaceId }).lean();
}

export async function getOverrideHistory({ workspaceId, scopeType, scopeId }) {
  return AttendanceOfficeHoursOverride.find({ workspaceId, scopeType, scopeId }).sort({ effectiveFrom: -1 }).lean();
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

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function assertValidFields(fields) {
  const { startLocalTime, endLocalTime, graceMinutes, earlyExitGraceMinutes, minimumFullDayMinutes, minimumHalfDayMinutes } = fields;
  const anySet = OVERRIDABLE_FIELDS.some((f) => fields[f] !== null && fields[f] !== undefined);
  if (!anySet) throw new ErrorResponse('At least one Office Hours field (start, end, grace, early-exit grace, min full-day, or min half-day) must be set', 400);

  if (startLocalTime !== null && startLocalTime !== undefined && !TIME_PATTERN.test(startLocalTime)) {
    throw new ErrorResponse('startLocalTime must be a valid HH:mm time', 400);
  }
  if (endLocalTime !== null && endLocalTime !== undefined && !TIME_PATTERN.test(endLocalTime)) {
    throw new ErrorResponse('endLocalTime must be a valid HH:mm time', 400);
  }
  if (startLocalTime && endLocalTime && startLocalTime === endLocalTime) {
    throw new ErrorResponse('Office Hours start and end cannot be the same time', 400);
  }
  for (const [label, value] of [['graceMinutes', graceMinutes], ['earlyExitGraceMinutes', earlyExitGraceMinutes]]) {
    if (value !== null && value !== undefined && (typeof value !== 'number' || value < 0)) {
      throw new ErrorResponse(`${label} must be a non-negative number`, 400);
    }
  }
  for (const [label, value] of [['minimumFullDayMinutes', minimumFullDayMinutes], ['minimumHalfDayMinutes', minimumHalfDayMinutes]]) {
    if (value !== null && value !== undefined && (typeof value !== 'number' || value < 1)) {
      throw new ErrorResponse(`${label} must be a positive number`, 400);
    }
  }
  if (minimumFullDayMinutes != null && minimumHalfDayMinutes != null && minimumHalfDayMinutes >= minimumFullDayMinutes) {
    throw new ErrorResponse('The half-day minimum must be less than the full-day minimum', 400);
  }
}

function pickFields(source) {
  const fields = {};
  for (const field of OVERRIDABLE_FIELDS) fields[field] = source[field] ?? null;
  return fields;
}

export async function createOverride({ workspaceId, scopeType, scopeId, priority = 0, effectiveFrom, effectiveUntil = null, createdBy, ...rest }) {
  if (!['ROLE', 'DEPARTMENT', 'USER'].includes(scopeType)) throw new ErrorResponse('scopeType must be ROLE, DEPARTMENT, or USER', 400);
  if (!scopeId) throw new ErrorResponse('scopeId is required', 400);
  if (!effectiveFrom) throw new ErrorResponse('effectiveFrom is required', 400);
  if (effectiveUntil && new Date(effectiveUntil).getTime() < new Date(effectiveFrom).getTime()) {
    throw new ErrorResponse('effectiveUntil cannot be before effectiveFrom', 400);
  }
  const fields = pickFields(rest);
  assertValidFields(fields);
  await assertScopeBelongsToWorkspace({ workspaceId, scopeType, scopeId });

  // Same resolution-time-disambiguation convention as Work Mode Override
  // (spec §39's "according to current policy/versioning architecture") —
  // multiple active overrides for the same scope are allowed to coexist;
  // the most specific + highest-priority + most-recent wins at read time.
  // Only exact duplicate-period rows for the same scope are rejected here.
  const overlapping = await AttendanceOfficeHoursOverride.findOne({
    workspaceId, scopeType, scopeId, isActive: true,
    effectiveFrom: { $lte: effectiveUntil || new Date('9999-12-31') },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: effectiveFrom } }]
  }).lean();
  if (overlapping) throw new ErrorResponse('An active Office Hours override already exists for this scope during an overlapping period. Deactivate it first or adjust the effective dates.', 400);

  return AttendanceOfficeHoursOverride.create({
    workspaceId, scopeType, scopeId, ...fields, priority, effectiveFrom, effectiveUntil, isActive: true, createdBy, updatedBy: createdBy
  });
}

export async function updateOverride({ workspaceId, overrideId, updates, updatedBy }) {
  const override = await AttendanceOfficeHoursOverride.findOne({ _id: overrideId, workspaceId });
  if (!override) throw new ErrorResponse('Office Hours override not found', 404);

  const merged = pickFields({ ...override.toObject(), ...updates });
  assertValidFields(merged);
  for (const field of OVERRIDABLE_FIELDS) override[field] = merged[field];
  if (updates.priority !== undefined) override.priority = updates.priority;
  if (updates.effectiveFrom !== undefined) override.effectiveFrom = updates.effectiveFrom;
  if (updates.effectiveUntil !== undefined) override.effectiveUntil = updates.effectiveUntil;
  override.updatedBy = updatedBy;
  await override.save();
  return override;
}

export async function deactivateOverride({ workspaceId, overrideId, updatedBy }) {
  const override = await AttendanceOfficeHoursOverride.findOneAndUpdate(
    { _id: overrideId, workspaceId }, { $set: { isActive: false, updatedBy } }, { new: true }
  );
  if (!override) throw new ErrorResponse('Office Hours override not found', 404);
  return override;
}

/** Every user this override's scope could affect — for realtime fan-out, never a broad room. Identical shape to attendanceWorkModeOverride.service.js's own helper. */
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
  return [];
}

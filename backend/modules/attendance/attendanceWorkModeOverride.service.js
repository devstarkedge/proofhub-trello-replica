import AttendanceWorkModeOverride from './attendanceWorkModeOverride.model.js';
import Department from '../../models/Department.js';
import Role from '../../models/Role.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

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

/**
 * `date`: the business date (a real Date instant) this resolution applies
 * to — future-scheduled overrides never apply early, and a later change
 * never reinterprets a historical date (spec §10).
 */
export async function resolveEffectiveWorkModePolicy({ workspaceId, userId, membership, policyVersion, date = new Date() }) {
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
    return {
      allowedWorkModes: winner.allowedModes, defaultMode: winner.defaultMode,
      source: { scopeType: winner.scopeType, scopeId: winner.scopeId, scopeName: await scopeName(winner.scopeType, winner.scopeId) }
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

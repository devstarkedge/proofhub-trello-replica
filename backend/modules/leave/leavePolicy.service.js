import mongoose from 'mongoose';
import LeavePolicy from './leavePolicy.model.js';
import LeavePolicyVersion from './leavePolicyVersion.model.js';
import LeavePolicyAssignment from './leavePolicyAssignment.model.js';
import LeaveType from './leaveType.model.js';
import Role from '../../models/Role.js';
import Workspace from '../../models/Workspace.js';
import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import User from '../../models/User.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import { getWorkspaceTimezone, nowInWorkspaceTz, dateOnlyToInstant, instantToDateOnlyKey } from './leaveTimezone.util.js';

const SPECIFICITY_RANK = { employee: 3, role: 2, department: 1, workspace: 0 };

export async function createPolicy({ workspaceId, name, description, createdBy, session }) {
  const [policy] = await LeavePolicy.create([{
    workspaceId, name, description: description || '', status: 'draft', createdBy
  }], session ? { session } : {});
  return policy;
}

export async function createDraftVersion({
  workspaceId, policyId, effectiveFrom, effectiveUntil = null,
  leaveTypeRules = [], blackout = { dates: [] }, approvalWorkflow = null, createdBy
}) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId });
  if (!policy) throw new ErrorResponse('Leave policy not found', 404);

  const latest = await LeavePolicyVersion.findOne({ workspaceId, policy: policyId })
    .sort({ versionNumber: -1 })
    .lean();
  const versionNumber = (latest?.versionNumber || 0) + 1;

  const version = await LeavePolicyVersion.create({
    workspaceId, policy: policyId, versionNumber, status: 'draft',
    effectiveFrom, effectiveUntil, leaveTypeRules, blackout, approvalWorkflow, createdBy
  });
  return version;
}

/**
 * Publishing a version freezes its content (see the model's own pre-save
 * guard) and supersedes whatever version was previously published for this
 * policy — but never edits the superseded version's historical content,
 * only its `status`/`supersededAt`. Requests/buckets already referencing
 * the superseded version keep reading exactly what was true when they were
 * created.
 */
export async function publishVersion({ workspaceId, policyId, versionId, actor }) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId });
  if (!policy) throw new ErrorResponse('Leave policy not found', 404);

  const version = await LeavePolicyVersion.findOne({ _id: versionId, workspaceId, policy: policyId });
  if (!version) throw new ErrorResponse('Leave policy version not found', 404);
  if (version.status === 'published') return version;
  if (!Array.isArray(version.leaveTypeRules) || version.leaveTypeRules.length === 0) {
    throw new ErrorResponse('A policy version needs at least one leave type rule before publishing', 400);
  }

  const previousPublished = await LeavePolicyVersion.findOne({
    workspaceId, policy: policyId, status: 'published'
  });
  if (previousPublished) {
    previousPublished.status = 'superseded';
    previousPublished.supersededAt = new Date();
    await previousPublished.save();
  }

  version.status = 'published';
  version.publishedAt = new Date();
  await version.save();

  policy.currentVersion = version._id;
  policy.status = 'active';
  await policy.save();

  return version;
}

export async function assignPolicy({
  workspaceId, policyId, scope, scopeRef = null, priority = 0,
  effectiveFrom, effectiveUntil = null, createdBy
}) {
  if (scope !== 'workspace' && !scopeRef) {
    throw new ErrorResponse(`scopeRef is required when scope is "${scope}"`, 400);
  }
  const assignment = await LeavePolicyAssignment.create({
    workspaceId, policy: policyId, scope, scopeRef: scope === 'workspace' ? null : scopeRef,
    priority, effectiveFrom, effectiveUntil, isActive: true, createdBy
  });
  return assignment;
}

async function resolveMembershipRoleId(membership, workspaceId) {
  const role = await Role.findResolvable(membership.role, workspaceId);
  return role?._id || null;
}

/**
 * Resolve which LeavePolicyAssignment applies to `userId` on `date`, most
 * specific scope wins (employee > role > department > workspace), tied
 * broken by priority then most recent effectiveFrom. `membership` is the
 * caller's already-loaded WorkspaceMembership for this user.
 */
export async function resolveAssignmentForUser({ workspaceId, userId, membership, date }) {
  const assignments = await LeavePolicyAssignment.find({
    workspaceId,
    isActive: true,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: date } }]
  }).lean();
  if (assignments.length === 0) return null;

  const roleId = await resolveMembershipRoleId(membership, workspaceId);
  const departmentIds = (membership.department || []).map(String);

  const matching = assignments.filter((a) => {
    if (a.scope === 'workspace') return true;
    if (a.scope === 'employee') return String(a.scopeRef) === String(userId);
    if (a.scope === 'role') return roleId && String(a.scopeRef) === String(roleId);
    if (a.scope === 'department') return departmentIds.includes(String(a.scopeRef));
    return false;
  });
  if (matching.length === 0) return null;

  matching.sort((a, b) => {
    const rankDiff = SPECIFICITY_RANK[b.scope] - SPECIFICITY_RANK[a.scope];
    if (rankDiff !== 0) return rankDiff;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
  });
  return matching[0];
}

/** The published LeavePolicyVersion in effect for `policyId` on `date`. */
export async function resolveVersionAtDate({ workspaceId, policyId, date }) {
  return LeavePolicyVersion.findOne({
    workspaceId, policy: policyId, status: { $in: ['published', 'superseded'] },
    effectiveFrom: { $lte: date }
  }).sort({ effectiveFrom: -1 }).limit(1);
}

/**
 * The single entry point every consumer (request submission, accrual,
 * dashboards) should use to answer "what policy version governs this
 * employee on this date." Returns null if the employee has no applicable
 * assignment — callers must treat that as "not eligible for Leave," not
 * silently default to some policy.
 */
export async function resolvePolicyContext({ workspaceId, userId, membership, date }) {
  const assignment = await resolveAssignmentForUser({ workspaceId, userId, membership, date });
  if (!assignment) return null;

  const version = await resolveVersionAtDate({ workspaceId, policyId: assignment.policy, date });
  if (!version) return null;

  return { assignment, policyVersion: version };
}

/** The leaveTypeRules[] entry for one leave type within a resolved policy version, or null. */
export function findLeaveTypeRule(policyVersion, leaveTypeId) {
  return (policyVersion.leaveTypeRules || []).find((rule) => String(rule.leaveType) === String(leaveTypeId)) || null;
}

export async function listLeaveTypes({ workspaceId, includeInactive = false }) {
  const filter = includeInactive ? {} : { isActive: true };
  return LeaveType.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
}

export async function createLeaveType({ workspaceId, key, name, description, color, icon, category, supportsHalfDay, displayOrder, createdBy }) {
  return LeaveType.create({
    workspaceId, key: String(key).trim().toLowerCase(), name, description, color, icon,
    category, supportsHalfDay, displayOrder, createdBy
  });
}

export async function listPolicies({ workspaceId, includeArchived = false }) {
  const filter = includeArchived ? {} : { status: { $ne: 'archived' } };
  return LeavePolicy.find(filter).sort({ createdAt: -1 }).lean();
}

export async function getPolicyWithVersions({ workspaceId, policyId }) {
  if (!mongoose.Types.ObjectId.isValid(policyId)) throw new ErrorResponse('Invalid policy id', 400);
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId }).lean();
  if (!policy) throw new ErrorResponse('Leave policy not found', 404);
  const versions = await LeavePolicyVersion.find({ workspaceId, policy: policyId })
    .sort({ versionNumber: -1 })
    .populate('leaveTypeRules.leaveType', 'name key category')
    .lean();
  return { policy, versions };
}

export async function listAssignments({ workspaceId, policyId }) {
  const filter = policyId ? { policy: policyId } : {};
  return LeavePolicyAssignment.find(filter).sort({ createdAt: -1 }).lean();
}

// ─────────────────────────────────────────────────────────────────────────
// Default-policy (workspace-wide, single-active) lifecycle.
//
// "Default" means isDefault:true — the one policy meant to govern the
// whole workspace, managed from the Policies settings page. It is the only
// concept subject to the "exactly one active policy per workspace"
// constraint (see the partial unique index on LeavePolicy); a
// department/role/employee override policy created via the advanced
// assignment API above is never marked default and never competes for
// this slot. Every read that actually needs "what governs this employee
// today" still goes through resolvePolicyContext -> resolveAssignmentForUser
// unchanged — activating a default policy here works purely by keeping the
// workspace's `scope:'workspace'` LeavePolicyAssignment pointed at it, so
// no resolution code needed to change for "the active policy is
// authoritative for every calculation" to hold.
// ─────────────────────────────────────────────────────────────────────────

function toMonthStartDateOnly(effectiveYear, effectiveMonth, timezone) {
  const year = Number(effectiveYear);
  const month = Number(effectiveMonth);
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new ErrorResponse('A valid policy start year is required', 400);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ErrorResponse('A valid policy start month (1-12) is required', 400);
  }
  // Built from plain integers, never a client Date object — the exact
  // calendar month/year the admin picked is reinterpreted here against the
  // WORKSPACE's timezone, so no browser-timezone offset can ever shift it
  // to a different day (the same class of bug fixed in the Leave Calendar
  // grid's date-key handling).
  return dateOnlyToInstant(`${year}-${String(month).padStart(2, '0')}-01`, timezone);
}

async function upsertWorkspaceDefaultAssignment({ workspaceId, policyId, effectiveFrom, createdBy, session }) {
  const existing = await LeavePolicyAssignment.findOne({ workspaceId, scope: 'workspace' }).session(session || null);
  if (existing) {
    existing.policy = policyId;
    existing.effectiveFrom = effectiveFrom;
    existing.isActive = true;
    await existing.save(session ? { session } : undefined);
    return existing;
  }
  const [created] = await LeavePolicyAssignment.create([{
    workspaceId, policy: policyId, scope: 'workspace', scopeRef: null, priority: 0,
    effectiveFrom, isActive: true, createdBy
  }], session ? { session } : {});
  return created;
}

async function deactivateOtherDefaultPolicies({ workspaceId, exceptPolicyId, session }) {
  await LeavePolicy.updateMany(
    { workspaceId, isDefault: true, status: 'active', _id: { $ne: exceptPolicyId } },
    { $set: { status: 'inactive' } },
    session ? { session } : {}
  );
}

/**
 * Makes `version` (already content-frozen, status 'draft'/'scheduled') the
 * workspace's one active default policy right now: publishes it if needed
 * (superseding whatever this SAME policy had previously published), flips
 * any OTHER default policy from 'active' to 'inactive', and repoints the
 * workspace-wide assignment — all inside one transaction. The partial
 * unique index on LeavePolicy is the DB-level backstop if two activations
 * race; a conflict surfaces as a friendly 409, never a raw duplicate-key
 * error.
 */
async function activateDefaultPolicyTransaction({ workspaceId, policy, version, actor }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await deactivateOtherDefaultPolicies({ workspaceId, exceptPolicyId: policy._id, session });

      if (version.status !== 'published') {
        const previousPublished = await LeavePolicyVersion.findOne({
          workspaceId, policy: policy._id, status: 'published'
        }).session(session);
        if (previousPublished) {
          previousPublished.status = 'superseded';
          previousPublished.supersededAt = new Date();
          await previousPublished.save({ session });
        }
        version.status = 'published';
        version.publishedAt = new Date();
        await version.save({ session });
      }

      policy.status = 'active';
      policy.currentVersion = version._id;
      policy.effectiveDate = version.effectiveFrom;
      if (String(policy.pendingVersion) === String(version._id)) policy.pendingVersion = null;
      await policy.save({ session });

      await upsertWorkspaceDefaultAssignment({
        workspaceId, policyId: policy._id, effectiveFrom: version.effectiveFrom,
        createdBy: actor?._id || actor?.id || policy.createdBy, session
      });
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ErrorResponse('Another policy activation is already in progress for this workspace — please retry.', 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return { policy, version };
}

/**
 * One-step creation of the workspace's default policy with a full
 * configuration (allocation/expiry/carry-forward/half-day per leave type,
 * blackout dates, approval workflow) rather than a bare name — the version
 * created here IS the policy's content, frozen the moment it's scheduled or
 * published (see the model guard). If `effectiveYear`/`effectiveMonth`
 * resolve to today-or-earlier in the workspace's timezone the policy
 * activates immediately; otherwise it is created as 'scheduled' and left
 * alone for runScheduledDefaultPolicyActivations to pick up later — the
 * workspace's currently active default policy (if any) keeps governing
 * every calculation until then.
 */
export async function createDefaultPolicy({
  workspaceId, name, description, effectiveYear, effectiveMonth,
  leaveTypeRules, approvalWorkflow, blackout, createdBy, actor
}) {
  if (!name || !String(name).trim()) throw new ErrorResponse('Policy name is required', 400);
  if (!Array.isArray(leaveTypeRules) || leaveTypeRules.length === 0) {
    throw new ErrorResponse('At least one leave type allocation (e.g. Full Day Leave) is required', 400);
  }

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const effectiveDate = toMonthStartDateOnly(effectiveYear, effectiveMonth, timezone);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();
  const isImmediate = effectiveDate.getTime() <= now.getTime();

  const policy = await LeavePolicy.create({
    workspaceId, name, description: description || '', isDefault: true,
    status: isImmediate ? 'draft' : 'scheduled',
    effectiveDate, createdBy
  });
  const version = await LeavePolicyVersion.create({
    workspaceId, policy: policy._id, versionNumber: 1,
    status: isImmediate ? 'draft' : 'scheduled',
    effectiveFrom: effectiveDate, leaveTypeRules,
    blackout: blackout || { dates: [] }, approvalWorkflow: approvalWorkflow || null, createdBy
  });

  if (isImmediate) {
    return activateDefaultPolicyTransaction({ workspaceId, policy, version, actor });
  }
  policy.pendingVersion = version._id;
  await policy.save();
  return { policy, version };
}

/**
 * Full-config edit of an existing default policy. Always creates a NEW
 * version (never mutates a published one — see spec's versioning-safety
 * requirement) and either activates it immediately or schedules it,
 * exactly like createDefaultPolicy. The confirmation-diff step itself is a
 * frontend concern (it already has the currently-published version's values
 * before the user edits, and the proposed new values before submit); this
 * function only runs once the user has confirmed.
 */
export async function editDefaultPolicy({
  workspaceId, policyId, name, description, effectiveYear, effectiveMonth,
  leaveTypeRules, approvalWorkflow, blackout, createdBy, actor
}) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: true });
  if (!policy) throw new ErrorResponse('Leave policy not found', 404);
  if (policy.status === 'archived') throw new ErrorResponse('An archived policy must be restored before it can be edited', 400);

  if (name !== undefined && String(name).trim()) policy.name = name;
  if (description !== undefined) policy.description = description;

  if (!Array.isArray(leaveTypeRules) || leaveTypeRules.length === 0) {
    await policy.save();
    return { policy, version: null };
  }

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const effectiveDate = toMonthStartDateOnly(effectiveYear, effectiveMonth, timezone);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();
  const isImmediate = effectiveDate.getTime() <= now.getTime();

  const latest = await LeavePolicyVersion.findOne({ workspaceId, policy: policyId }).sort({ versionNumber: -1 }).lean();
  const version = await LeavePolicyVersion.create({
    workspaceId, policy: policyId, versionNumber: (latest?.versionNumber || 0) + 1,
    status: isImmediate ? 'draft' : 'scheduled',
    effectiveFrom: effectiveDate, leaveTypeRules,
    blackout: blackout || { dates: [] }, approvalWorkflow: approvalWorkflow || null, createdBy
  });

  if (isImmediate) {
    return activateDefaultPolicyTransaction({ workspaceId, policy, version, actor });
  }

  // A future-dated edit to a policy that's already active must NOT flip
  // the policy's own status away from 'active' — its current published
  // version keeps governing every calculation until this scheduled one is
  // promoted. Only a policy that has never been activated at all (still
  // 'draft') moves to 'scheduled' here.
  version.status = 'scheduled';
  await version.save();
  policy.pendingVersion = version._id;
  if (policy.status === 'draft') {
    policy.status = 'scheduled';
    policy.effectiveDate = effectiveDate;
  }
  await policy.save();
  return { policy, version };
}

/**
 * Manual "Activate Now" — only ever lets a policy activate AT OR AFTER its
 * own configured effective date, checked against the workspace's timezone
 * (never the caller's browser clock). This exists for the case the
 * scheduler hasn't run yet at the exact boundary; it is not a way to bypass
 * the effective date. Reactivating an already-'inactive' default policy
 * (switching the workspace back to a previous policy) goes through the
 * same path, using its currentVersion.
 */
export async function activateDefaultPolicyManually({ workspaceId, policyId, actor }) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: true });
  if (!policy) throw new ErrorResponse('Leave policy not found', 404);
  if (policy.status === 'archived') throw new ErrorResponse('An archived policy must be restored before it can be activated', 400);

  const targetVersionId = policy.pendingVersion || policy.currentVersion;
  if (!targetVersionId) throw new ErrorResponse('This policy has no configured version to activate yet', 400);
  const version = await LeavePolicyVersion.findOne({ _id: targetVersionId, workspaceId });
  if (!version) throw new ErrorResponse('Policy version not found', 404);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();
  if (new Date(version.effectiveFrom).getTime() > now.getTime()) {
    const friendlyDate = instantToDateOnlyKey(version.effectiveFrom, timezone);
    throw new ErrorResponse(
      `This policy is scheduled to start on ${friendlyDate} and can't be activated early. It will take effect automatically on that date.`,
      400
    );
  }

  if (policy.status === 'active' && String(policy.currentVersion) === String(version._id)) {
    return { policy, version }; // already active — idempotent no-op, not an error
  }

  return activateDefaultPolicyTransaction({ workspaceId, policy, version, actor });
}

export async function archiveDefaultPolicy({ workspaceId, policyId }) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: true });
  if (!policy) throw new ErrorResponse('Leave policy not found', 404);
  if (policy.status === 'active') {
    throw new ErrorResponse('The active policy can’t be archived directly — activate a different policy first.', 400);
  }
  policy.status = 'archived';
  policy.pendingVersion = null;
  await policy.save();
  return policy;
}

/**
 * Idempotent scheduler sweep: promotes every default policy's pending
 * ('scheduled') version whose effectiveFrom has arrived, per that
 * workspace's own timezone. Safe to run as often as the scheduler likes —
 * once a policy's pendingVersion is cleared by a successful activation, it
 * no longer matches the query below, so a re-run (or a crash mid-sweep) is
 * a genuine no-op, matching leaveExpiry.service.js's own idempotency style.
 */
export async function runScheduledDefaultPolicyActivations() {
  const workspaces = await Workspace.find({ leaveModuleEnabled: true }).select('_id timezone').lean();
  const results = [];

  for (const workspace of workspaces) {
    const timezone = getWorkspaceTimezone(workspace);
    const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();

    await workspaceContext.run({ workspaceId: workspace._id }, async () => {
      const duePolicies = await LeavePolicy.find({
        workspaceId: workspace._id, isDefault: true, status: { $ne: 'archived' }, pendingVersion: { $ne: null }
      });

      for (const policy of duePolicies) {
        try {
          const version = await LeavePolicyVersion.findOne({
            _id: policy.pendingVersion, workspaceId: workspace._id, status: 'scheduled'
          });
          if (!version || new Date(version.effectiveFrom).getTime() > now.getTime()) continue;

          await activateDefaultPolicyTransaction({ workspaceId: workspace._id, policy, version, actor: null });
          policy.pendingVersion = null;
          await policy.save();
          results.push({ workspaceId: workspace._id, policyId: policy._id, activated: true });
        } catch (error) {
          console.error('[Leave] scheduled policy activation error', {
            workspaceId: workspace._id, policyId: policy._id, error: error.message
          });
        }
      }
    });
  }

  return results;
}

export async function listDefaultPolicies({ workspaceId, includeArchived = true }) {
  const filter = { isDefault: true, ...(includeArchived ? {} : { status: { $ne: 'archived' } }) };
  return LeavePolicy.find(filter)
    .sort({ createdAt: -1 })
    .populate('currentVersion', 'versionNumber effectiveFrom leaveTypeRules status publishedAt')
    .populate('pendingVersion', 'versionNumber effectiveFrom leaveTypeRules status')
    .lean();
}

// ─────────────────────────────────────────────────────────────────────────
// Override policies — a policy targeted at one specific department, role,
// or employee via LeavePolicyAssignment, always isDefault:false so it never
// competes for the workspace's single-active-default slot. Whoever it
// targets is governed by it instead of the default policy (resolution is
// unchanged — resolveAssignmentForUser already picks the most specific
// scope), and everyone else keeps reading the default policy exactly as
// before. Fully UI-driven: every step below (create/version/publish/assign)
// reuses the same tested primitives as the advanced API, just orchestrated
// as one call so the Settings page never has to make four separate
// requests or risk leaving a half-created override behind.
// ─────────────────────────────────────────────────────────────────────────

async function assertScopeRefExists({ workspaceId, scope, scopeRef }) {
  if (scope === 'department') {
    const department = await Department.findOne({ _id: scopeRef, workspaceId }).select('_id').lean();
    if (!department) throw new ErrorResponse('Department not found in this workspace', 404);
  } else if (scope === 'role') {
    const role = await Role.findById(scopeRef).select('_id').lean();
    if (!role) throw new ErrorResponse('Role not found', 404);
  } else if (scope === 'employee') {
    const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: scopeRef }).select('_id').lean();
    if (!membership) throw new ErrorResponse('Employee not found in this workspace', 404);
  }
}

export async function createOverridePolicy({
  workspaceId, name, description, scope, scopeRef, priority = 0,
  effectiveYear, effectiveMonth, leaveTypeRules, createdBy, actor
}) {
  if (!['department', 'role', 'employee'].includes(scope)) {
    throw new ErrorResponse('Choose a department, role, or employee to apply this override to', 400);
  }
  if (!scopeRef) throw new ErrorResponse('A specific department, role, or employee must be selected', 400);
  if (!name || !String(name).trim()) throw new ErrorResponse('Policy name is required', 400);
  if (!Array.isArray(leaveTypeRules) || leaveTypeRules.length === 0) {
    throw new ErrorResponse('At least one leave type allocation is required', 400);
  }
  await assertScopeRefExists({ workspaceId, scope, scopeRef });

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const effectiveDate = toMonthStartDateOnly(effectiveYear, effectiveMonth, timezone);

  const policy = await createPolicy({ workspaceId, name, description, createdBy });
  const version = await createDraftVersion({
    workspaceId, policyId: policy._id, effectiveFrom: effectiveDate, leaveTypeRules, createdBy
  });
  const publishedVersion = await publishVersion({ workspaceId, policyId: policy._id, versionId: version._id, actor });
  const assignment = await assignPolicy({
    workspaceId, policyId: policy._id, scope, scopeRef, priority, effectiveFrom: effectiveDate, createdBy
  });

  return { policy: await LeavePolicy.findById(policy._id).lean(), version: publishedVersion, assignment };
}

export async function editOverridePolicy({
  workspaceId, policyId, name, description, effectiveYear, effectiveMonth, leaveTypeRules, createdBy, actor
}) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: false });
  if (!policy) throw new ErrorResponse('Override policy not found', 404);
  if (policy.status === 'archived') throw new ErrorResponse('An archived override must be restored before it can be edited', 400);

  if (name !== undefined && String(name).trim()) policy.name = name;
  if (description !== undefined) policy.description = description;
  await policy.save();

  // publishVersion re-fetches the policy fresh and only touches
  // currentVersion/status, so saving name/description first (above) is
  // never clobbered by it.
  let publishedVersion = null;
  if (Array.isArray(leaveTypeRules) && leaveTypeRules.length) {
    const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
    const timezone = getWorkspaceTimezone(workspace);
    const effectiveDate = toMonthStartDateOnly(effectiveYear, effectiveMonth, timezone);
    const version = await createDraftVersion({
      workspaceId, policyId, effectiveFrom: effectiveDate, leaveTypeRules, createdBy
    });
    publishedVersion = await publishVersion({ workspaceId, policyId, versionId: version._id, actor });
  }

  return { policy: await LeavePolicy.findById(policyId).lean(), version: publishedVersion };
}

/**
 * Deactivating an assignment reverts whoever it targeted back to the
 * workspace default policy — resolveAssignmentForUser simply stops finding
 * a match for them at this scope. The policy document and its history stay
 * intact (nothing is deleted), so re-assigning it later, or looking back at
 * what applied to a past request, both keep working.
 */
export async function removeOverrideAssignment({ workspaceId, assignmentId }) {
  const assignment = await LeavePolicyAssignment.findOne({ _id: assignmentId, workspaceId });
  if (!assignment) throw new ErrorResponse('Assignment not found', 404);
  if (assignment.scope === 'workspace') {
    throw new ErrorResponse('The workspace-wide assignment can’t be removed directly — activate a different default policy instead.', 400);
  }
  assignment.isActive = false;
  await assignment.save();
  return assignment;
}

export async function archiveOverridePolicy({ workspaceId, policyId }) {
  const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: false });
  if (!policy) throw new ErrorResponse('Override policy not found', 404);
  await LeavePolicyAssignment.updateMany({ workspaceId, policy: policyId, isActive: true }, { $set: { isActive: false } });
  policy.status = 'archived';
  await policy.save();
  return policy;
}

async function resolveScopeTargetNames({ workspaceId, assignments }) {
  const departmentIds = assignments.filter((a) => a.scope === 'department').map((a) => a.scopeRef);
  const roleIds = assignments.filter((a) => a.scope === 'role').map((a) => a.scopeRef);
  const userIds = assignments.filter((a) => a.scope === 'employee').map((a) => a.scopeRef);

  const [departments, roles, users] = await Promise.all([
    departmentIds.length ? Department.find({ _id: { $in: departmentIds } }).select('name').lean() : [],
    roleIds.length ? Role.find({ _id: { $in: roleIds } }).select('name').lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('name email').lean() : []
  ]);
  const deptNameById = new Map(departments.map((d) => [String(d._id), d.name]));
  const roleNameById = new Map(roles.map((r) => [String(r._id), r.name]));
  const userNameById = new Map(users.map((u) => [String(u._id), u.name || u.email]));

  return assignments.map((a) => ({
    ...a,
    targetName: a.scope === 'department' ? (deptNameById.get(String(a.scopeRef)) || 'Unknown department')
      : a.scope === 'role' ? (roleNameById.get(String(a.scopeRef)) || 'Unknown role')
      : (userNameById.get(String(a.scopeRef)) || 'Unknown employee')
  }));
}

export async function listOverridePolicies({ workspaceId }) {
  const policies = await LeavePolicy.find({ isDefault: false })
    .sort({ createdAt: -1 })
    .populate('currentVersion', 'versionNumber effectiveFrom leaveTypeRules status publishedAt')
    .lean();
  if (!policies.length) return [];

  const policyIds = policies.map((p) => p._id);
  const assignments = await LeavePolicyAssignment.find({ workspaceId, policy: { $in: policyIds }, isActive: true }).lean();
  const withNames = await resolveScopeTargetNames({ workspaceId, assignments });

  const assignmentsByPolicy = new Map();
  for (const assignment of withNames) {
    const key = String(assignment.policy);
    const list = assignmentsByPolicy.get(key) || [];
    list.push(assignment);
    assignmentsByPolicy.set(key, list);
  }

  return policies.map((policy) => ({ ...policy, assignments: assignmentsByPolicy.get(String(policy._id)) || [] }));
}

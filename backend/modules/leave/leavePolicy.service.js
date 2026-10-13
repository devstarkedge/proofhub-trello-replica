import mongoose from 'mongoose';
import LeavePolicy from './leavePolicy.model.js';
import LeavePolicyVersion from './leavePolicyVersion.model.js';
import LeavePolicyAssignment from './leavePolicyAssignment.model.js';
import LeaveType from './leaveType.model.js';
import LeaveRequest from './leaveRequest.model.js';
import LeaveAccrualBucket from './leaveAccrualBucket.model.js';
import LeaveLedger from './leaveLedger.model.js';
import LeaveApprovalWorkflow from './leaveApprovalWorkflow.model.js';
import Role from '../../models/Role.js';
import Workspace from '../../models/Workspace.js';
import Department from '../../models/Department.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import User from '../../models/User.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import {
  getWorkspaceTimezone, nowInWorkspaceTz, dateOnlyToInstant, instantToDateOnlyKey,
  getCurrentPeriodKey, getPeriodKey, getPeriodBounds, computeExpiryDate
} from './leaveTimezone.util.js';
import { getEffectiveEmploymentProfile } from './leaveEmployeeProfile.service.js';
import { computeAccrualForPeriod } from './leaveAccrual.service.js';
import { creditBucket } from './leaveBalance.service.js';

const SPECIFICITY_RANK = { employee: 3, role: 2, department: 1, workspace: 0 };

async function withPolicyWrite(workspaceId, callback) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      await Workspace.updateOne({ _id: workspaceId }, { $inc: { __v: 1 } }, { session });
      result = await callback(session);
    });
  } finally { await session.endSession(); }
  return result;
}

async function validatePolicyConfiguration({ workspaceId, leaveTypeRules, approvalWorkflow, blackout }) {
  if (!Array.isArray(leaveTypeRules) || leaveTypeRules.some((rule) => !rule || !mongoose.isValidObjectId(rule.leaveType))) throw new ErrorResponse('Choose valid leave types for the policy', 400);
  const ids = leaveTypeRules.map((r) => String(r.leaveType));
  if (new Set(ids).size !== ids.length) throw new ErrorResponse('Each leave type may only appear once in a policy', 400);
  const types = await LeaveType.find({ workspaceId, _id: { $in: ids }, isActive: true }).lean();
  if (types.length !== ids.length) throw new ErrorResponse('Every leave type must be active and belong to this workspace', 400);
  for (const rule of leaveTypeRules) {
    if (rule.maxDurationMinutesPerInstance != null && (!Number.isInteger(Number(rule.maxDurationMinutesPerInstance)) || Number(rule.maxDurationMinutesPerInstance) < 1 || Number(rule.maxDurationMinutesPerInstance) > 1440)) throw new ErrorResponse('Short-leave duration must be a whole number of minutes between 1 and 1440', 400);
    if (!Number.isFinite(Number(rule.monthlyCreditAmount)) || Number(rule.monthlyCreditAmount) < 0) throw new ErrorResponse('Monthly leave credit must be non-negative', 400);
  }
  if (approvalWorkflow && !await LeaveApprovalWorkflow.exists({ _id: approvalWorkflow, workspaceId })) throw new ErrorResponse('Approval workflow not found in this workspace', 400);
  const departments = [...new Set((blackout?.dates || []).flatMap((d) => (d.departmentIds || []).map(String)))];
  if (departments.length && await Department.countDocuments({ workspaceId, _id: { $in: departments } }) !== departments.length) throw new ErrorResponse('Blackout departments must belong to this workspace', 400);
}

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
  return withPolicyWrite(workspaceId, async (session) => {
    const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId }).session(session);
    if (!policy) throw new ErrorResponse('Leave policy not found', 404);
    if (policy.status === 'archived') throw new ErrorResponse('Archived policies cannot receive new versions', 400);
    await validatePolicyConfiguration({ workspaceId, leaveTypeRules, approvalWorkflow, blackout });
  
    const latest = await LeavePolicyVersion.findOne({ workspaceId, policy: policyId })
      .sort({ versionNumber: -1 })
      .session(session).lean();
    const versionNumber = (latest?.versionNumber || 0) + 1;
  
    const [version] = await LeavePolicyVersion.create([{
      workspaceId, policy: policyId, versionNumber, status: 'draft',
      effectiveFrom, effectiveUntil, leaveTypeRules, blackout, approvalWorkflow, createdBy
    }], { session });
    return version;
  });
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
  return withPolicyWrite(workspaceId, async (session) => {
    const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId }).session(session);
    if (!policy) throw new ErrorResponse('Leave policy not found', 404);
    if (policy.isDefault || policy.status === 'archived') throw new ErrorResponse('Use explicit activation for default policies; archived policies cannot be published', 400);
  
    const version = await LeavePolicyVersion.findOne({ _id: versionId, workspaceId, policy: policyId }).session(session);
    if (!version) throw new ErrorResponse('Leave policy version not found', 404);
    if (version.status === 'published') return version;
    if (!Array.isArray(version.leaveTypeRules) || version.leaveTypeRules.length === 0) {
      throw new ErrorResponse('A policy version needs at least one leave type rule before publishing', 400);
    }
  
    const previousPublished = await LeavePolicyVersion.findOne({
      workspaceId, policy: policyId, status: 'published'
    }).session(session);
    if (previousPublished) {
      previousPublished.status = 'superseded';
      previousPublished.supersededAt = new Date();
      await previousPublished.save({ session });
    }
  
    version.status = 'published';
    version.publishedAt = new Date();
    await version.save({ session });
  
    policy.currentVersion = version._id;
    policy.status = 'active';
    await policy.save({ session });
  
    return version;
  });
}

export async function assignPolicy({
  workspaceId, policyId, scope, scopeRef = null, priority = 0,
  effectiveFrom, effectiveUntil = null, createdBy
}) {
  return withPolicyWrite(workspaceId, async (session) => {
    const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId }).session(session);
    if (!policy || policy.status === 'archived' || policy.isDefault) throw new ErrorResponse('Only non-archived override policies can use this assignment API', 400);
    if (scope === 'workspace') throw new ErrorResponse('Use explicit default-policy activation for workspace assignments', 400);
    if (scope !== 'workspace' && !scopeRef) {
      throw new ErrorResponse(`scopeRef is required when scope is "${scope}"`, 400);
    }
    await assertScopeRefExists({ workspaceId, scope, scopeRef });
    const [assignment] = await LeavePolicyAssignment.create([{
      workspaceId, policy: policyId, scope, scopeRef: scope === 'workspace' ? null : scopeRef,
      priority, effectiveFrom, effectiveUntil, isActive: true, createdBy
    }], { session });
    return assignment;
  });
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
export async function resolveAssignmentForUser({ workspaceId, userId, membership, date, session = null }) {
  let query = LeavePolicyAssignment.find({
    workspaceId,
    isActive: true,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: date } }]
  });
  if (session) query = query.session(session);
  const assignments = await query.lean();
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
  }).sort({ effectiveFrom: -1, versionNumber: -1 }).limit(1);
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
  const policies = await LeavePolicy.find({ workspaceId, ...filter }).sort({ createdAt: -1 }).lean();
  return annotatePolicyDeletionEligibility({ workspaceId, policies });
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
  const now = new Date();
  const existing = await LeavePolicyAssignment.findOne({ workspaceId, scope: 'workspace', isActive: true, effectiveUntil: null }).session(session || null);
  if (existing && String(existing.policy) === String(policyId)) return existing;
  if (existing) {
    // Preserve which policy governed the old interval for historical resolution.
    existing.effectiveUntil = new Date(now.getTime() - 1);
    await existing.save(session ? { session } : undefined);
  }
  const [created] = await LeavePolicyAssignment.create([{
    workspaceId, policy: policyId, scope: 'workspace', scopeRef: null, priority: 0,
    effectiveFrom: existing ? now : effectiveFrom, isActive: true, createdBy
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
 * When a default policy becomes active for a workspace, reconcile employee
 * accrual buckets for the current period so that activating a replacement
 * policy adjusts the current month's grant to match the new policy instead
 * of incorrectly stacking independent allocations on top of the old policy.
 * Historical periods (< currentPeriod) remain untouched. Employees with
 * specific override assignments (employee, department, role) are unaffected.
 */
export async function reconcileActivePolicyTransition({ workspaceId, policy, version, actor, session }) {
  const workspace = await Workspace.findById(workspaceId).select('timezone').session(session).lean();
  const timezone = getWorkspaceTimezone(workspace);
  const currentPeriod = getCurrentPeriodKey(timezone);
  const { start: periodStart } = getPeriodBounds(currentPeriod, timezone);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();

  // If the new policy's effectiveFrom is in a future month, don't reconcile current month.
  const versionPeriod = getPeriodKey(version.effectiveFrom, timezone);
  if (versionPeriod > currentPeriod) {
    return { reconciled: 0 };
  }

  const members = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).session(session).lean();
  let reconciled = 0;

  for (const membership of members) {
    // Check if this user is covered by an override policy
    const assignment = await resolveAssignmentForUser({
      workspaceId, userId: membership.user, membership, date: now, session
    });
    if (assignment && assignment.scope !== 'workspace' && String(assignment.policy) !== String(policy._id)) {
      continue;
    }

    // Check if this member has already received accruals for currentPeriod
    const existingMemberBuckets = await LeaveAccrualBucket.find({
      workspaceId, user: membership.user, period: currentPeriod
    }).session(session);

    if (existingMemberBuckets.length === 0) {
      // Accrual has not run for this member for currentPeriod yet;
      // leave it to monthly accrual so initial setup / empty periods are cleanly handled.
      continue;
    }

    const profile = await getEffectiveEmploymentProfile({ workspaceId, userId: membership.user });
    const effectiveHireDate = profile.accrualStartOverrideDate || profile.hireDate || membership.joinedAt;

    for (const rule of (version.leaveTypeRules || [])) {
      const isEligible = (rule.eligibleEmploymentStatuses || ['ACTIVE', 'ON_PROBATION']).includes(profile.employmentStatus);
      let targetAmount = 0;
      if (isEligible) {
        const { shouldCredit, amount } = computeAccrualForPeriod({
          rule, effectiveHireDate, period: currentPeriod, timezone
        });
        if (shouldCredit && amount > 0) {
          targetAmount = amount;
        }
      }

      const bucket = existingMemberBuckets.find(
        (b) => String(b.leaveType) === String(rule.leaveType)
      );

      if (bucket) {
        const currentAmount = bucket.creditedAmount;
        const delta = Math.round((targetAmount - currentAmount) * 100) / 100;

        if (delta > 0) {
          bucket.creditedAmount = Math.round((bucket.creditedAmount + delta) * 100) / 100;
          bucket.policyVersion = version._id;
          const newExpiry = computeExpiryDate(periodStart, rule.expiryRule, timezone);
          if (newExpiry) bucket.expiresAt = newExpiry;
          await bucket.save({ session });

          await LeaveLedger.create([{
            workspaceId,
            user: membership.user,
            leaveType: rule.leaveType,
            bucket: bucket._id,
            type: 'POLICY_MIGRATION_ADJUSTMENT',
            amount: delta,
            balanceDelta: delta,
            policySource: { assignmentId: assignment?._id, scope: assignment?.scope || 'workspace', scopeRef: assignment?.scopeRef },
            reason: `Policy transition credit adjustment (${policy.name})`,
            actor: actor?._id || actor?.id || null,
            occurredAt: new Date(),
            policyVersion: version._id
          }], { session });
          reconciled++;
        } else if (delta < 0) {
          const available = bucket.creditedAmount - bucket.consumedAmount - (bucket.debitedAmount || 0) - bucket.reservedAmount - bucket.expiredAmount;
          const reduction = Math.min(Math.abs(delta), Math.max(0, available));
          const roundedReduction = Math.round(reduction * 100) / 100;

          if (roundedReduction > 0) {
            bucket.creditedAmount = Math.round((bucket.creditedAmount - roundedReduction) * 100) / 100;
            bucket.policyVersion = version._id;
            await bucket.save({ session });

            await LeaveLedger.create([{
              workspaceId,
              user: membership.user,
              leaveType: rule.leaveType,
              bucket: bucket._id,
              type: 'POLICY_MIGRATION_ADJUSTMENT',
              amount: roundedReduction,
              balanceDelta: -roundedReduction,
              policySource: { assignmentId: assignment?._id, scope: assignment?.scope || 'workspace', scopeRef: assignment?.scopeRef },
              reason: `Policy transition reduction adjustment (${policy.name})`,
              actor: actor?._id || actor?.id || null,
              occurredAt: new Date(),
              policyVersion: version._id
            }], { session });
            reconciled++;
          } else {
            bucket.policyVersion = version._id;
            await bucket.save({ session });
          }
        } else {
          if (String(bucket.policyVersion) !== String(version._id)) {
            bucket.policyVersion = version._id;
            await bucket.save({ session });
          }
        }
      } else if (targetAmount > 0) {
        const expiresAt = computeExpiryDate(periodStart, rule.expiryRule, timezone);
        const [newBucket] = await LeaveAccrualBucket.create([{
          workspaceId,
          user: membership.user,
          leaveType: rule.leaveType,
          policyVersion: version._id,
          period: currentPeriod,
          sourceType: 'POLICY_MIGRATION',
          creditedAmount: targetAmount,
          creditedAt: periodStart,
          expiresAt,
          status: 'active',
          reason: `Policy transition accrual (${policy.name})`,
          createdBy: actor?._id || actor?.id || null
        }], { session });

        await LeaveLedger.create([{
          workspaceId,
          user: membership.user,
          leaveType: rule.leaveType,
          bucket: newBucket._id,
          type: 'POLICY_MIGRATION_ADJUSTMENT',
          amount: targetAmount,
          balanceDelta: targetAmount,
          policySource: { assignmentId: assignment?._id, scope: assignment?.scope || 'workspace', scopeRef: assignment?.scopeRef },
          reason: `Policy transition initial allocation (${policy.name})`,
          actor: actor?._id || actor?.id || null,
          occurredAt: periodStart,
          policyVersion: version._id
        }], { session });
        reconciled++;
      }
    }
  }

  return { reconciled };
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
      // Serialize transitions targeting different policies in the same workspace.
      await Workspace.updateOne({ _id: workspaceId }, { $inc: { __v: 1 } }, { session });
      const expectedVersionId = version._id;
      policy = await LeavePolicy.findOne({ _id: policy._id, workspaceId, isDefault: true }).session(session);
      if (!policy || policy.status === 'archived') throw new ErrorResponse('Policy is archived or no longer exists; refresh and retry', 409);
      if (String(policy.pendingVersion || policy.currentVersion) !== String(expectedVersionId)) throw new ErrorResponse('Policy configuration changed; refresh before activating', 409);
      version = await LeavePolicyVersion.findOne({ _id: expectedVersionId, workspaceId, policy: policy._id }).session(session);
      if (!version || new Date(version.effectiveFrom) > new Date()) throw new ErrorResponse('The policy effective date has not arrived', 400);
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

      await reconcileActivePolicyTransition({
        workspaceId, policy, version, actor, session
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

/** Create configuration as a draft. Only explicit activation makes a new policy effective. */
export async function createDefaultPolicy({
  workspaceId, name, description, effectiveYear, effectiveMonth,
  leaveTypeRules, approvalWorkflow, blackout, createdBy, actor
}) {
  if (!name || !String(name).trim()) throw new ErrorResponse('Policy name is required', 400);
  if (!Array.isArray(leaveTypeRules) || leaveTypeRules.length === 0) {
    throw new ErrorResponse('At least one leave type allocation (e.g. Full Day Leave) is required', 400);
  }
  await validatePolicyConfiguration({ workspaceId, leaveTypeRules, approvalWorkflow, blackout });

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const effectiveDate = toMonthStartDateOnly(effectiveYear, effectiveMonth, timezone);
  const session = await mongoose.startSession();
  let policy, version;
  try {
    await session.withTransaction(async () => {
      [policy] = await LeavePolicy.create([{
        workspaceId, name, description: description || '', isDefault: true,
        status: 'draft', effectiveDate, createdBy
      }], { session });
      [version] = await LeavePolicyVersion.create([{
        workspaceId, policy: policy._id, versionNumber: 1, status: 'draft',
        effectiveFrom: effectiveDate, leaveTypeRules,
        blackout: blackout || { dates: [] }, approvalWorkflow: approvalWorkflow || null, createdBy
      }], { session });
      policy.pendingVersion = version._id;
      await policy.save({ session });
    });
  } finally { await session.endSession(); }
  return { policy, version };
}

/** Save a new immutable version; drafts stay drafts and active-policy future edits are scheduled. */
export async function editDefaultPolicy({
  workspaceId, policyId, name, description, effectiveYear, effectiveMonth,
  leaveTypeRules, approvalWorkflow, blackout, createdBy, actor
}) {
  const saved = await withPolicyWrite(workspaceId, async (session) => {
    const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: true }).session(session);
    if (!policy) throw new ErrorResponse('Leave policy not found', 404);
    if (policy.status === 'archived') throw new ErrorResponse('An archived policy must be restored before it can be edited', 400);
    if (name !== undefined && String(name).trim()) policy.name = name;
    if (description !== undefined) policy.description = description;
    if (!Array.isArray(leaveTypeRules) || !leaveTypeRules.length) {
      await policy.save({ session });
      return { policy, version: null };
    }
    await validatePolicyConfiguration({ workspaceId, leaveTypeRules, approvalWorkflow, blackout });
    const workspace = await Workspace.findById(workspaceId).select('timezone').session(session).lean();
    const effectiveDate = toMonthStartDateOnly(effectiveYear, effectiveMonth, getWorkspaceTimezone(workspace));
    const immediate = effectiveDate.getTime() <= Date.now();
    const latest = await LeavePolicyVersion.findOne({ workspaceId, policy: policyId }).sort({ versionNumber: -1 }).session(session).lean();
    const [version] = await LeavePolicyVersion.create([{
      workspaceId, policy: policyId, versionNumber: (latest?.versionNumber || 0) + 1,
      status: !immediate && ['active', 'scheduled'].includes(policy.status) ? 'scheduled' : 'draft',
      effectiveFrom: effectiveDate, leaveTypeRules,
      blackout: blackout || { dates: [] }, approvalWorkflow: approvalWorkflow || null, createdBy
    }], { session });
    policy.pendingVersion = version._id;
    if (['draft', 'inactive'].includes(policy.status)) policy.effectiveDate = effectiveDate;
    await policy.save({ session });
    return { policy, version, activate: immediate && policy.status === 'active' };
  });
  if (saved.activate) return activateDefaultPolicyTransaction({ workspaceId, policy: saved.policy, version: saved.version, actor });
  return { policy: saved.policy, version: saved.version };
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
  const version = await LeavePolicyVersion.findOne({ _id: targetVersionId, workspaceId, policy: policyId });
  if (!version) throw new ErrorResponse('Policy version not found', 404);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();
  if (new Date(version.effectiveFrom).getTime() > now.getTime()) {
    const friendlyDate = instantToDateOnlyKey(version.effectiveFrom, timezone);
    throw new ErrorResponse(
      `This policy is scheduled to start on ${friendlyDate} and can't be activated early. Activate it on or after that date; explicitly scheduled updates run automatically.`,
      400
    );
  }

  if (policy.status === 'active' && String(policy.currentVersion) === String(version._id)) {
    return { policy, version }; // already active — idempotent no-op, not an error
  }

  return activateDefaultPolicyTransaction({ workspaceId, policy, version, actor });
}

export async function archiveDefaultPolicy({ workspaceId, policyId }) {
  return withPolicyWrite(workspaceId, async (session) => {
    const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: true }).session(session);
    if (!policy) throw new ErrorResponse('Leave policy not found', 404);
    if (policy.status === 'active') throw new ErrorResponse('Activate a different policy before archiving the active policy', 400);
    policy.status = 'archived'; policy.pendingVersion = null;
    await policy.save({ session });
    return policy;
  });
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
  const policies = await LeavePolicy.find({ workspaceId, ...filter })
    .sort({ createdAt: -1 })
    // A plain top-level populate does NOT reach the nested
    // leaveTypeRules[].leaveType ref inside the version document — without
    // the nested `populate` option here, every rule's leaveType stays an
    // unpopulated ObjectId and the UI falls back to a generic "Leave" label
    // instead of "Full Day Leave" / "Short Leave".
    .populate({
      path: 'currentVersion',
      select: 'versionNumber effectiveFrom leaveTypeRules status publishedAt',
      populate: { path: 'leaveTypeRules.leaveType', select: 'name key category' }
    })
    .populate({
      path: 'pendingVersion',
      select: 'versionNumber effectiveFrom leaveTypeRules status',
      populate: { path: 'leaveTypeRules.leaveType', select: 'name key category' }
    })
    .lean();
  return annotatePolicyDeletionEligibility({ workspaceId, policies });
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
  return withPolicyWrite(workspaceId, async (session) => {
    const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault: false }).session(session);
    if (!policy) throw new ErrorResponse('Override policy not found', 404);
    await LeavePolicyAssignment.updateMany({ workspaceId, policy: policyId, isActive: true }, { $set: { isActive: false } }, { session });
    policy.status = 'archived'; policy.pendingVersion = null;
    await policy.save({ session });
    return policy;
  });
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
  const policies = await LeavePolicy.find({ workspaceId, isDefault: false })
    .sort({ createdAt: -1 })
    .populate({
      path: 'currentVersion',
      select: 'versionNumber effectiveFrom leaveTypeRules status publishedAt',
      populate: { path: 'leaveTypeRules.leaveType', select: 'name key category' }
    })
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

  return annotatePolicyDeletionEligibility({ workspaceId, policies: policies.map((policy) => ({ ...policy, assignments: assignmentsByPolicy.get(String(policy._id)) || [] })) });
}

async function annotatePolicyDeletionEligibility({ workspaceId, policies, session = null }) {
  const archived = policies.filter((p) => p.status === 'archived');
  if (!archived.length) return policies;
  const policyIds = archived.map((p) => p._id);
  const versions = await LeavePolicyVersion.find({ workspaceId, policy: { $in: policyIds } }).select('_id policy').session(session).lean();
  const versionIds = versions.map((v) => v._id);
  const queries = [
    () => LeaveRequest.distinct('policyVersion', { workspaceId, policyVersion: { $in: versionIds } }).session(session),
    () => LeaveAccrualBucket.distinct('policyVersion', { workspaceId, policyVersion: { $in: versionIds } }).session(session),
    () => LeaveLedger.distinct('policyVersion', { workspaceId, policyVersion: { $in: versionIds } }).session(session),
    () => LeavePolicyAssignment.distinct('policy', { workspaceId, policy: { $in: policyIds }, isActive: true }).session(session),
    () => LeavePolicy.find({ workspaceId, _id: { $nin: policyIds }, $or: [{ currentVersion: { $in: versionIds } }, { pendingVersion: { $in: versionIds } }] }).select('currentVersion pendingVersion').session(session).lean()
  ];
  const results = [];
  if (session) { for (const query of queries) results.push(await query()); }
  else results.push(...await Promise.all(queries.map((query) => query())));
  const [requests, buckets, ledger, assignments, pointers] = results;
  const referencedVersions = new Set([...requests, ...buckets, ...ledger, ...pointers.flatMap((p) => [p.currentVersion, p.pendingVersion]).filter(Boolean)].map(String));
  const blocked = new Set(assignments.map(String));
  versions.forEach((v) => { if (referencedVersions.has(String(v._id))) blocked.add(String(v.policy)); });
  return policies.map((p) => ({ ...p, canDelete: p.status === 'archived' && !p.pendingVersion && !blocked.has(String(p._id)), deletionBlockReason: p.status === 'archived' && (p.pendingVersion || blocked.has(String(p._id))) ? 'Referenced by leave requests, balances, ledger history, assignments, or scheduled configuration. Keep archived to preserve history.' : null }));
}

/** Serialize new historical references with permanent configuration deletion. */
export async function assertPolicyVersionAvailable({ workspaceId, policyVersionId, session }) {
  await Workspace.updateOne({ _id: workspaceId }, { $inc: { __v: 1 } }, { session });
  if (!await LeavePolicyVersion.exists({ _id: policyVersionId, workspaceId }).session(session)) throw new ErrorResponse('The applicable policy changed; refresh and retry', 409);
}

/** Remove unused archived configuration only. Never cascade employee or audit history. */
export async function deleteArchivedPolicy({ workspaceId, policyId, isDefault }) {
  if (!mongoose.isValidObjectId(policyId)) throw new ErrorResponse('Invalid policy id', 400);
  const session = await mongoose.startSession();
  let deleted;
  try {
    await session.withTransaction(async () => {
      await Workspace.updateOne({ _id: workspaceId }, { $inc: { __v: 1 } }, { session });
      const policy = await LeavePolicy.findOne({ _id: policyId, workspaceId, isDefault }).session(session);
      if (!policy) throw new ErrorResponse('Policy not found in this workspace', 404);
      if (policy.status !== 'archived' || policy.pendingVersion) throw new ErrorResponse('Only archived policies without scheduled updates can be permanently deleted', 400);
      const [eligibility] = await annotatePolicyDeletionEligibility({ workspaceId, policies: [policy.toObject()], session });
      if (!eligibility.canDelete) throw new ErrorResponse(eligibility.deletionBlockReason, 409);
      // Only unused, owned configuration rows are removed. Audit logs remain.
      await LeavePolicyVersion.deleteMany({ workspaceId, policy: policyId }, { session });
      await LeavePolicyAssignment.deleteMany({ workspaceId, policy: policyId, isActive: false }, { session });
      const result = await LeavePolicy.deleteOne({ _id: policyId, workspaceId, status: 'archived' }, { session });
      if (!result.deletedCount) throw new ErrorResponse('Policy changed concurrently; refresh and retry', 409);
      deleted = policy.toObject();
    });
  } finally { await session.endSession(); }
  return deleted;
}

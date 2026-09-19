import mongoose from 'mongoose';
import AttendancePolicy from './attendancePolicy.model.js';
import AttendancePolicyVersion from './attendancePolicyVersion.model.js';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, nowInWorkspaceTz, dateOnlyToInstant, instantToDateOnlyKey } from '../leave/leaveTimezone.util.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';

/**
 * Attendance policy lifecycle — a simplified, workspace-only version of
 * leavePolicy.service.js's proven default-policy pattern (draft/scheduled/
 * active/inactive/archived, content frozen once scheduled or published, a
 * DB-level partial-unique-index guaranteeing exactly one active policy per
 * workspace, a transactional activation that flips any other active policy
 * to inactive). Simpler than Leave's because there is no per-department/
 * role/employee assignment layer here — one workspace has exactly one
 * applicable Attendance policy, full stop (spec's own model, no
 * assignment-resolution complexity needed).
 */

export async function getPolicyConfiguration({ workspaceId }) {
  const policy = await AttendancePolicy.findOne({ workspaceId, isDefault: true })
    .populate('currentVersion')
    .populate('pendingVersion')
    .lean();
  return policy;
}

/** The published version currently governing this workspace's attendance calculations, or null if none has ever been activated. */
export async function resolveApplicablePolicyVersion({ workspaceId }) {
  const policy = await AttendancePolicy.findOne({ workspaceId, isDefault: true, status: 'active' }).lean();
  if (!policy?.currentVersion) return null;
  return AttendancePolicyVersion.findOne({ _id: policy.currentVersion, workspaceId }).lean();
}

function assertValidPolicyContent(content) {
  if (!Array.isArray(content.allowedWorkModes) || content.allowedWorkModes.length === 0) {
    throw new ErrorResponse('At least one allowed work mode (Office/WFH/Hybrid/Field) must be configured', 400);
  }
  if (content.minimumHalfDayMinutes >= content.minimumFullDayMinutes) {
    throw new ErrorResponse('The half-day minimum must be less than the full-day minimum', 400);
  }
}

async function upsertWorkspaceDefaultAssignment() {
  // No assignment table for Attendance policy (workspace-only) — kept as a
  // no-op function so the activation transaction shape below reads
  // identically to leavePolicy.service.js's, in case a future requirement
  // genuinely needs department-scoped Attendance policies; deferring that
  // exact layer until it's actually asked for, matching this session's
  // established "workspace-only for now" scope-control decision.
}

async function deactivateOtherPolicies({ workspaceId, exceptPolicyId, session }) {
  await AttendancePolicy.updateMany(
    { workspaceId, isDefault: true, status: 'active', _id: { $ne: exceptPolicyId } },
    { $set: { status: 'inactive' } },
    session ? { session } : {}
  );
}

async function activatePolicyTransaction({ workspaceId, policy, version }) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await deactivateOtherPolicies({ workspaceId, exceptPolicyId: policy._id, session });

      if (version.status !== 'published') {
        const previousPublished = await AttendancePolicyVersion.findOne({
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

      await upsertWorkspaceDefaultAssignment();
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

export async function createPolicy({ workspaceId, name, description, effectiveDate, content, createdBy }) {
  if (!name || !String(name).trim()) throw new ErrorResponse('Policy name is required', 400);
  assertValidPolicyContent(content);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const targetEffectiveDate = dateOnlyToInstant(effectiveDate, timezone);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();
  const isImmediate = targetEffectiveDate.getTime() <= now.getTime();

  const policy = await AttendancePolicy.create({
    workspaceId, name, description: description || '', isDefault: true,
    status: isImmediate ? 'draft' : 'scheduled', effectiveDate: targetEffectiveDate, createdBy
  });
  const version = await AttendancePolicyVersion.create({
    workspaceId, policy: policy._id, versionNumber: 1,
    status: isImmediate ? 'draft' : 'scheduled', effectiveFrom: targetEffectiveDate,
    createdBy, ...content
  });

  if (isImmediate) return activatePolicyTransaction({ workspaceId, policy, version });
  policy.pendingVersion = version._id;
  await policy.save();
  return { policy, version };
}

export async function editPolicy({ workspaceId, policyId, name, description, effectiveDate, content, createdBy }) {
  const policy = await AttendancePolicy.findOne({ _id: policyId, workspaceId, isDefault: true });
  if (!policy) throw new ErrorResponse('Attendance policy not found', 404);
  if (policy.status === 'archived') throw new ErrorResponse('An archived policy must be restored before it can be edited', 400);

  if (name !== undefined && String(name).trim()) policy.name = name;
  if (description !== undefined) policy.description = description;
  await policy.save();

  if (!content) return { policy, version: null };
  assertValidPolicyContent(content);

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);
  const targetEffectiveDate = dateOnlyToInstant(effectiveDate, timezone);
  const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();
  const isImmediate = targetEffectiveDate.getTime() <= now.getTime();

  const latest = await AttendancePolicyVersion.findOne({ workspaceId, policy: policyId }).sort({ versionNumber: -1 }).lean();
  const version = await AttendancePolicyVersion.create({
    workspaceId, policy: policyId, versionNumber: (latest?.versionNumber || 0) + 1,
    status: isImmediate ? 'draft' : 'scheduled', effectiveFrom: targetEffectiveDate,
    createdBy, ...content
  });

  if (isImmediate) return activatePolicyTransaction({ workspaceId, policy, version });

  version.status = 'scheduled';
  await version.save();
  policy.pendingVersion = version._id;
  if (policy.status === 'draft') {
    policy.status = 'scheduled';
    policy.effectiveDate = targetEffectiveDate;
  }
  await policy.save();
  return { policy, version };
}

export async function activatePolicyManually({ workspaceId, policyId }) {
  const policy = await AttendancePolicy.findOne({ _id: policyId, workspaceId, isDefault: true });
  if (!policy) throw new ErrorResponse('Attendance policy not found', 404);
  if (policy.status === 'archived') throw new ErrorResponse('An archived policy must be restored before it can be activated', 400);

  const targetVersionId = policy.pendingVersion || policy.currentVersion;
  if (!targetVersionId) throw new ErrorResponse('This policy has no configured version to activate yet', 400);
  const version = await AttendancePolicyVersion.findOne({ _id: targetVersionId, workspaceId });
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
    return { policy, version };
  }
  return activatePolicyTransaction({ workspaceId, policy, version });
}

export async function archivePolicy({ workspaceId, policyId }) {
  const policy = await AttendancePolicy.findOne({ _id: policyId, workspaceId, isDefault: true });
  if (!policy) throw new ErrorResponse('Attendance policy not found', 404);
  if (policy.status === 'active') {
    throw new ErrorResponse('The active policy can’t be archived directly — activate a different policy first.', 400);
  }
  policy.status = 'archived';
  policy.pendingVersion = null;
  await policy.save();
  return policy;
}

/** Idempotent scheduler sweep — mirrors leavePolicy.service.js#runScheduledDefaultPolicyActivations exactly. */
export async function runScheduledPolicyActivations() {
  const workspaces = await Workspace.find({ attendanceModuleEnabled: true }).select('_id timezone').lean();
  const results = [];

  for (const workspace of workspaces) {
    const timezone = getWorkspaceTimezone(workspace);
    const now = nowInWorkspaceTz(timezone).toUTC().toJSDate();

    await workspaceContext.run({ workspaceId: workspace._id }, async () => {
      const duePolicies = await AttendancePolicy.find({
        workspaceId: workspace._id, isDefault: true, status: { $ne: 'archived' }, pendingVersion: { $ne: null }
      });
      for (const policy of duePolicies) {
        try {
          const version = await AttendancePolicyVersion.findOne({
            _id: policy.pendingVersion, workspaceId: workspace._id, status: 'scheduled'
          });
          if (!version || new Date(version.effectiveFrom).getTime() > now.getTime()) continue;

          await activatePolicyTransaction({ workspaceId: workspace._id, policy, version });
          policy.pendingVersion = null;
          await policy.save();
          results.push({ workspaceId: workspace._id, policyId: policy._id, activated: true });
        } catch (error) {
          console.error('[Attendance] scheduled policy activation error', {
            workspaceId: workspace._id, policyId: policy._id, error: error.message
          });
        }
      }
    });
  }
  return results;
}

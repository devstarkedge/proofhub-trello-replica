import WfhRequest from './wfhRequest.model.js';
import LeaveRequest from '../leave/leaveRequest.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, dateOnlyToInstant } from '../leave/leaveTimezone.util.js';
import { resolveAttendanceEligibility } from './attendanceEligibility.service.js';
import { resolveApplicablePolicyVersion } from './attendancePolicy.service.js';
import { generateApprovalLevels, registerApprovalEntityHandler } from './attendanceApproval.service.js';
import { codedError } from './attendanceErrors.js';
import * as attendanceHooks from './attendanceHooks.js';

registerApprovalEntityHandler('WFH_REQUEST', {
  load: (entityId, dbSession) => WfhRequest.findById(entityId).session(dbSession),
  loadSummaries: (entityIds) => WfhRequest.find({ _id: { $in: entityIds } }).populate('requester', 'name email avatar').select('requester startDate endDate reason status').lean(),
  onFinalOutcome: async (entity, finalOutcome, dbSession) => {
    entity.status = finalOutcome === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    entity.decidedAt = new Date();
    await entity.save({ session: dbSession });
  },
  afterCommit: async (result, actor) => {
    await attendanceHooks.onWfhDecided(result, actor);
  }
});

/**
 * WFH request submission (spec §51) — an ad hoc "let me work from home on
 * this date/range" request from an otherwise-Office (or fixed-schedule
 * Hybrid) employee. This is distinct from a standing Work Mode Override
 * that already grants WFH (see attendanceWorkModeOverride.service.js),
 * which needs no per-day request at all — see attendanceWorkMode.service.js.
 */
export async function submitWfhRequest({ workspaceId, userId, membership, workspace, startDate, endDate, reason, isRecurring = false, createdBy }) {
  const eligibility = await resolveAttendanceEligibility({ workspaceId, userId, membership, workspace });
  if (!eligibility.attendanceRequired) {
    throw codedError('Attendance does not apply to your account in this workspace.', 403, 'ATTENDANCE_NOT_REQUIRED');
  }

  const policyVersion = await resolveApplicablePolicyVersion({ workspaceId });
  if (!policyVersion) throw codedError('Attendance has not been fully configured for this workspace yet.', 400, 'POLICY_NOT_CONFIGURED');
  if (!policyVersion.wfh?.enabled) throw codedError('Work-from-home is not enabled for this workspace.', 400, 'WORK_MODE_NOT_AUTHORIZED');
  if (isRecurring && !policyVersion.wfh.allowRecurring) throw new ErrorResponse('Recurring work-from-home requests are not enabled for this workspace.', 400);

  const timezone = getWorkspaceTimezone(workspace);
  const startInstant = dateOnlyToInstant(startDate, timezone);
  const endInstant = dateOnlyToInstant(endDate, timezone);
  if (endInstant.getTime() < startInstant.getTime()) throw new ErrorResponse('End date cannot be before the start date', 400);

  const now = new Date();
  if (!policyVersion.wfh.allowFutureDates && startInstant.getTime() > now.getTime()) {
    throw new ErrorResponse('Work-from-home requests for future dates are not allowed by policy.', 400);
  }
  const durationDays = Math.round((endInstant.getTime() - startInstant.getTime()) / 86400000) + 1;
  if (policyVersion.wfh.maxDurationDays && durationDays > policyVersion.wfh.maxDurationDays) {
    throw new ErrorResponse(`Work-from-home requests cannot exceed ${policyVersion.wfh.maxDurationDays} day(s) at a time.`, 400);
  }

  const overlapping = await WfhRequest.findOne({
    workspaceId, requester: userId, status: { $in: ['PENDING_APPROVAL', 'APPROVED'] },
    startDate: { $lte: endInstant }, endDate: { $gte: startInstant }
  }).lean();
  if (overlapping) throw new ErrorResponse('You already have a pending or approved work-from-home request overlapping these dates.', 400);

  const conflictingLeave = await LeaveRequest.findOne({
    workspaceId, requester: userId, status: 'APPROVED',
    startDate: { $lte: endInstant }, endDate: { $gte: startInstant }
  }).lean();
  if (conflictingLeave) throw new ErrorResponse('You have approved leave overlapping these dates — cancel it first if you want to request work-from-home instead.', 400);

  const requireApproval = Boolean(policyVersion.wfh.requireApproval);
  const request = await WfhRequest.create({
    workspaceId, requester: userId, startDate: startInstant, endDate: endInstant, reason: reason || '', isRecurring,
    status: requireApproval ? 'PENDING_APPROVAL' : 'APPROVED', policyVersion: policyVersion._id, requiredApproval: requireApproval,
    decidedAt: requireApproval ? null : now, createdBy
  });

  let approvalLevels = [];
  if (requireApproval) {
    // A real business-logic step, not a notification — must never be
    // silently swallowed: without it, a PENDING_APPROVAL request would
    // exist with zero approvers able to ever decide it.
    approvalLevels = await generateApprovalLevels({
      workspaceId, entityType: 'WFH_REQUEST', entityId: request._id, requesterId: userId,
      requesterMembership: membership, approverLevels: policyVersion.wfh.approverLevels
    });
  }

  try {
    await attendanceHooks.onWfhSubmitted(request, userId);
    if (approvalLevels.length) await attendanceHooks.onWfhApprovalRequired(request, approvalLevels, userId);
  } catch (error) {
    // A notification/realtime failure must never surface as a failed
    // submission — the request itself already committed above.
    console.error('[Attendance] WFH submission notification error:', error.message);
  }

  return request;
}

export async function listMyWfhRequests({ workspaceId, userId }) {
  return WfhRequest.find({ workspaceId, requester: userId }).sort({ createdAt: -1 }).lean();
}

export async function cancelWfhRequest({ workspaceId, requestId, userId }) {
  const request = await WfhRequest.findOne({ _id: requestId, workspaceId, requester: userId });
  if (!request) throw new ErrorResponse('Work-from-home request not found', 404);
  if (!['PENDING_APPROVAL', 'APPROVED'].includes(request.status)) {
    throw new ErrorResponse('Only a pending or approved request can be cancelled', 400);
  }
  request.status = 'CANCELLED';
  await request.save();
  return request;
}

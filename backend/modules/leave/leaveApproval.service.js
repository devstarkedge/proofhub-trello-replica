import mongoose from 'mongoose';
import LeaveApproval from './leaveApproval.model.js';
import LeaveRequest, { LEAVE_REQUEST_STATUSES } from './leaveRequest.model.js';
import AuditLog from '../../models/AuditLog.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { resolveDepartmentManagers, resolveActiveMembersByRole, resolveAdminApprovers } from './leaveApprovalAudience.service.js';
import { releaseReservationsForRequest, consumeReservationsForRequest } from './leaveBalance.service.js';
import * as leaveHooks from './leaveHooks.js';

const auditEntry = ({ workspaceId, actor, action, targetId, before, after }) => ({
  workspace: workspaceId,
  actor,
  action,
  category: 'leave_management',
  targetType: 'LeaveRequest',
  targetId,
  changes: { before, after }
});

function tierOf(roleTierMap, role) {
  const map = roleTierMap instanceof Map ? roleTierMap : new Map(Object.entries(roleTierMap || {}));
  return map.has(role) ? map.get(role) : 0; // unknown/custom roles default to Employee tier (conservative)
}

/**
 * Build the approval chain for a newly-submitted request. A level is
 * created only if it sits strictly above the requester's own tier (see
 * LeaveApprovalWorkflow.roleTierMap) — reproducing Employee-needs-
 * Manager+HR+Admin / Manager-or-HR-needs-only-Admin / Admin-always-needs-
 * someone-else without any per-role branch in this function. Mutates
 * `request.blockedReason` in place when the Admin level resolves to zero
 * eligible approvers; caller must persist that change in the same
 * transaction. Must run inside the caller's session — writes LeaveApproval
 * rows via insertMany.
 */
export async function generateApprovalChain({ workspaceId, request, requesterMembership, workflow, session }) {
  const roleTierMap = workflow.roleTierMap instanceof Map ? workflow.roleTierMap : new Map(Object.entries(workflow.roleTierMap || {}));
  const requesterTier = tierOf(roleTierMap, requesterMembership.role);
  const managerTier = roleTierMap.has('manager') ? roleTierMap.get('manager') : 1;

  const levels = [];

  if (requesterTier < managerTier) {
    const managerIds = await resolveDepartmentManagers({
      workspaceId, departmentIds: requesterMembership.department, excludeUserId: request.requester
    });
    if (managerIds.length > 0) levels.push({ level: 'DEPARTMENT_MANAGER', eligibleApproverUserIds: managerIds });

    const hrIds = await resolveActiveMembersByRole({ workspaceId, role: 'hr', excludeUserId: request.requester });
    if (hrIds.length > 0) levels.push({ level: 'HR', eligibleApproverUserIds: hrIds });
  }

  const adminIds = await resolveAdminApprovers({ workspaceId, excludeUserId: request.requester, workflow });
  levels.push({ level: 'ADMIN', eligibleApproverUserIds: adminIds });
  if (adminIds.length === 0) {
    request.blockedReason = 'NO_ELIGIBLE_APPROVER';
  }

  const created = await LeaveApproval.insertMany(
    levels.map((entry) => ({ workspaceId, request: request._id, ...entry })),
    { session }
  );
  return created;
}

/**
 * Decide one approval level. Authorization is structural, not permission-
 * engine-based: the actor must appear in this level's frozen
 * eligibleApproverUserIds snapshot, and can never be the request's own
 * requester under any role. The decision write is a conditional
 * findOneAndUpdate matching {status:'PENDING'} — a concurrent second
 * decision attempt on the same level matches zero documents and surfaces
 * as a 409, never a silent overwrite.
 */
export async function decideApproval({ workspaceId, approvalId, actor, decision, comment = '' }) {
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw new ErrorResponse('Decision must be APPROVED or REJECTED', 400);
  }
  const actorId = actor._id || actor.id;

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const approval = await LeaveApproval.findOne({ _id: approvalId, workspaceId }).session(session);
      if (!approval) throw new ErrorResponse('Approval task not found', 404);

      const request = await LeaveRequest.findOne({ _id: approval.request, workspaceId }).session(session);
      if (!request) throw new ErrorResponse('Leave request not found', 404);

      if (String(request.requester) === String(actorId)) {
        throw new ErrorResponse('You cannot approve or reject your own leave request', 403);
      }
      const isEligible = (approval.eligibleApproverUserIds || []).some((id) => String(id) === String(actorId));
      if (!isEligible) {
        throw new ErrorResponse('You are not an eligible approver for this request', 403);
      }

      const updatedApproval = await LeaveApproval.findOneAndUpdate(
        { _id: approvalId, workspaceId, status: 'PENDING' },
        { $set: { status: decision, decidedBy: actorId, decidedAt: new Date(), comment } },
        { new: true, session }
      );
      if (!updatedApproval) {
        throw new ErrorResponse('This approval has already been decided', 409);
      }

      const allLevels = await LeaveApproval.find({ workspaceId, request: request._id }).session(session);
      const anyRejected = allLevels.some((level) => level.status === 'REJECTED');
      const allApproved = allLevels.every((level) => level.status === 'APPROVED');
      const anyApproved = allLevels.some((level) => level.status === 'APPROVED');

      const statusBefore = request.status;
      let finalOutcome = null;

      if (anyRejected) {
        await LeaveApproval.updateMany(
          { workspaceId, request: request._id, status: 'PENDING' },
          { $set: { status: 'VOIDED' } },
          { session }
        );
        request.status = LEAVE_REQUEST_STATUSES.REJECTED;
        await releaseReservationsForRequest({
          workspaceId, request: request._id, reason: 'Leave request rejected', actor: actorId, session
        });
        finalOutcome = 'REJECTED';
      } else if (allApproved) {
        request.status = LEAVE_REQUEST_STATUSES.APPROVED;
        await consumeReservationsForRequest({
          workspaceId, request: request._id, reason: 'Leave request fully approved', actor: actorId, session
        });
        finalOutcome = 'APPROVED';
      } else if (anyApproved) {
        request.status = LEAVE_REQUEST_STATUSES.PARTIALLY_APPROVED;
      }
      await request.save({ session });

      await AuditLog.create([auditEntry({
        workspaceId, actor: actorId, action: `LEAVE_APPROVAL_${decision}`, targetId: request._id,
        before: { status: statusBefore, level: approval.level },
        after: { status: request.status, level: approval.level, decision, comment }
      })], { session });

      result = {
        request: request.toObject(),
        approval: updatedApproval.toObject(),
        allLevels: allLevels.map((level) => level.toObject()),
        finalOutcome
      };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }

  try {
    await leaveHooks.onApprovalDecisionRecorded(result, actor);
    if (result.finalOutcome === 'APPROVED') await leaveHooks.onRequestApproved(result.request);
    if (result.finalOutcome === 'REJECTED') await leaveHooks.onRequestRejected(result.request, result.approval);
  } catch (error) {
    // Notification failure must never surface as a failed approval — the
    // decision itself already committed successfully above.
    console.error('[Leave] post-approval notification error:', error.message);
  }

  return result;
}

export async function getApprovalQueue({ workspaceId, userId }) {
  return LeaveApproval.find({ workspaceId, status: 'PENDING', eligibleApproverUserIds: userId })
    .sort({ createdAt: 1 })
    .populate({ path: 'request', populate: [{ path: 'requester', select: 'name email avatar' }, { path: 'leaveType', select: 'name key category' }] })
    .lean();
}

export async function getApprovalTimeline({ workspaceId, requestId }) {
  return LeaveApproval.find({ workspaceId, request: requestId })
    .sort({ level: 1 })
    .populate('decidedBy', 'name email avatar')
    .populate('eligibleApproverUserIds', 'name email avatar')
    .lean();
}

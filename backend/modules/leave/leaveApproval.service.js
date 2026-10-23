import { enqueueLeaveAttendanceChanges } from '../attendance/attendanceEvents.service.js';
import mongoose from 'mongoose';
import LeaveApproval from './leaveApproval.model.js';
import LeaveRequest, { LEAVE_REQUEST_STATUSES, PENDING_STATUSES } from './leaveRequest.model.js';
import AuditLog from '../../models/AuditLog.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { resolveDepartmentManagers, resolveActiveMembersByRole, resolveAdminApprovers } from './leaveApprovalAudience.service.js';
import { releaseReservationsForRequest, consumeReservationsForRequest } from './leaveBalance.service.js';
import { getLeaveActionContext, eligibleStage, orderStages } from './leaveActionEligibility.service.js';
import { canViewUserInLeaveScope } from './leaveAuthorization.service.js';
import { queryLeaveRequests } from './leaveRequestQuery.service.js';
import { approvalOutcome } from './leaveApprovalRules.js';
import { enqueueLeaveEvent, deliverLeaveEventsSoon } from './leaveEvents.service.js';

const auditEntry = ({ workspaceId, actor, action, targetId, before, after }) => ({
  workspace: workspaceId,
  actor,
  action,
  category: 'leave_management',
  targetType: 'LeaveRequest',
  targetId,
  changes: { before, after }
});

/**
 * Snapshot current workspace approvers, excluding the requester. Admin and
 * one of Manager/HR must approve, regardless of the requester's own tier.
 */
export async function generateApprovalChain({ workspaceId, request, requesterMembership, workflow, session }) {
  const levels = [];
  const managerIds = await resolveDepartmentManagers({
    workspaceId, departmentIds: requesterMembership.department, excludeUserId: request.requester
  });
  if (managerIds.length > 0) levels.push({ level: 'DEPARTMENT_MANAGER', eligibleApproverUserIds: managerIds });

  const hrIds = await resolveActiveMembersByRole({ workspaceId, role: 'hr', excludeUserId: request.requester });
  if (hrIds.length > 0) levels.push({ level: 'HR', eligibleApproverUserIds: hrIds });
  const adminIds = await resolveAdminApprovers({ workspaceId, excludeUserId: request.requester, workflow });
  levels.push({ level: 'ADMIN', eligibleApproverUserIds: adminIds });
  if (adminIds.length === 0 || levels.length === 1) {
    request.blockedReason = 'NO_ELIGIBLE_APPROVER';
  }

  const created = await LeaveApproval.insertMany(
    levels.map((entry, sequence) => ({ workspaceId, request: request._id, ...entry, sequence, mode: workflow.approvalMode || 'PARALLEL' })),
    { session }
  );
  return created;
}

/**
 * Decide one approval level. The actor must be in its assignment snapshot
 * and retain current workspace access and stage authority. Explicit access
 * denials and sequential ordering apply; self-approval is always forbidden.
 * The decision write is a conditional
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

      // Write the parent before reading all stages: concurrent decisions on
      // different stages must retry against the same committed request state.
      if (!PENDING_STATUSES.includes(request.status)) throw new ErrorResponse('This leave request is no longer awaiting approval', 409);
      await LeaveRequest.updateOne({ _id: request._id, workspaceId }, { $inc: { __v: 1 } }, { session });
      const stages = await LeaveApproval.find({ workspaceId, request: request._id }).session(session).lean();
      const context = await getLeaveActionContext({ workspaceId, viewer: actor, session });
      if (!canViewUserInLeaveScope(context.visibility, request.requester)) throw new ErrorResponse('You no longer have access to this leave request', 403);

      if (String(request.requester) === String(actorId)) {
        throw new ErrorResponse('You cannot approve or reject your own leave request', 403);
      }
      const isEligible = (approval.eligibleApproverUserIds || []).some((id) => String(id) === String(actorId));
      if (!isEligible) {
        throw new ErrorResponse('You are not an eligible approver for this request', 403);
      }
      if (approval.status !== 'PENDING') throw new ErrorResponse('This approval has already been decided', 409);
      if (!eligibleStage({ request, stage: approval, stages, context, decision })) throw new ErrorResponse('This stage is not currently authorized or is waiting for an earlier stage', 403);

      const updatedApproval = await LeaveApproval.findOneAndUpdate(
        { _id: approvalId, workspaceId, status: 'PENDING' },
        { $set: { status: decision, decidedBy: actorId, decidedAt: new Date(), comment } },
        { new: true, session }
      );
      if (!updatedApproval) {
        throw new ErrorResponse('This approval has already been decided', 409);
      }

      const allLevels = await LeaveApproval.find({ workspaceId, request: request._id }).session(session);
      const outcome = approvalOutcome(allLevels);

      const statusBefore = request.status;
      let finalOutcome = null;

      if (outcome === 'REJECTED') {
        await LeaveApproval.updateMany(
          { workspaceId, request: request._id, status: 'PENDING' },
          { $set: { status: 'VOIDED' } },
          { session }
        );
        for (const level of allLevels) if (level.status === 'PENDING') level.status = 'VOIDED';
        request.status = LEAVE_REQUEST_STATUSES.REJECTED;
        await releaseReservationsForRequest({
          workspaceId, request: request._id, reason: 'Leave request rejected', actor: actorId, session
        });
        finalOutcome = 'REJECTED';
      } else if (outcome === 'APPROVED') {
        request.status = LEAVE_REQUEST_STATUSES.APPROVED;
        await consumeReservationsForRequest({
          workspaceId, request: request._id, reason: 'Leave request fully approved', actor: actorId, session
        });
        finalOutcome = 'APPROVED';
      } else if (outcome === 'PARTIALLY_APPROVED') {
        request.status = LEAVE_REQUEST_STATUSES.PARTIALLY_APPROVED;
      }
      await request.save({ session });
      if (finalOutcome === 'APPROVED') {
        await LeaveApproval.updateMany({ workspaceId, request: request._id, status: 'PENDING' },
          { $set: { status: 'VOIDED' } }, { session });
        for (const level of allLevels) if (level.status === 'PENDING') level.status = 'VOIDED';
      }
      if(finalOutcome==='APPROVED')await enqueueLeaveAttendanceChanges(request,session);

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
      await enqueueLeaveEvent({ workspaceId, key: `decision-${approvalId}`, kind: 'DECIDED',
        payload: { result, actor: { _id: actorId } } }, session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }

  deliverLeaveEventsSoon(workspaceId);

  return result;
}

export async function getApprovalQueue({ workspaceId, userId }) {
  const result = await queryLeaveRequests({ workspaceId, viewer: { _id: userId }, view: 'approval' });
  return result.requests;
}

export async function getApprovalTimeline({ workspaceId, requestId }) {
  const stages = await LeaveApproval.find({ workspaceId, request: requestId })
    .sort({ level: 1 })
    .populate('decidedBy', 'name email avatar')
    .populate('eligibleApproverUserIds', 'name email avatar')
    .lean();
  return orderStages(stages);
}

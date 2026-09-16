import mongoose from 'mongoose';
import LeaveRequest, { LEAVE_REQUEST_STATUSES } from './leaveRequest.model.js';
import LeaveRequestDay from './leaveRequestDay.model.js';
import LeaveApproval from './leaveApproval.model.js';
import LeaveType from './leaveType.model.js';
import LeavePolicyVersion from './leavePolicyVersion.model.js';
import Workspace from '../../models/Workspace.js';
import AuditLog from '../../models/AuditLog.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, computeExpiryDate, eachCalendarDate } from './leaveTimezone.util.js';
import { buildCalendarContext, classifyDateWithContext } from './leaveCalendar.service.js';
import { resolvePolicyContext, findLeaveTypeRule } from './leavePolicy.service.js';
import { getEffectiveEmploymentProfile } from './leaveEmployeeProfile.service.js';
import {
  assertValidDateRange, assertValidDayType, assertNoOverlap, assertEmploymentEligible,
  assertDayTypeMatchesLeaveTypeCategory, assertShortLeaveDuration, assertHalfDayAllowed, checkBlackout
} from './leaveRequest.validation.js';
import { reserveFromBuckets, releaseReservationsForRequest, restoreConsumptionForRequest } from './leaveBalance.service.js';
import { generateApprovalChain } from './leaveApproval.service.js';
import { getOrCreateActiveWorkflow } from './leaveApprovalWorkflow.service.js';
import { scheduleApprovalReminders } from '../../schedulers/leaveReminderScheduler.js';
import { resolveActiveMembersByRole } from './leaveApprovalAudience.service.js';
import * as leaveHooks from './leaveHooks.js';

const auditEntry = ({ workspaceId, actor, action, targetId, before, after }) => ({
  workspace: workspaceId, actor, action, category: 'leave_management',
  targetType: 'LeaveRequest', targetId, changes: { before, after }
});

const DAY_UNIT_BY_TYPE = { FULL_DAY: 1, HALF_DAY_FIRST_HALF: 0.5, HALF_DAY_SECOND_HALF: 0.5, SHORT_LEAVE: 1 };

export async function submitLeaveRequest({
  workspaceId, requesterUser, leaveTypeId, startDate, endDate, dayType,
  reason = '', shortLeaveStartTime = null, shortLeaveEndTime = null,
  shortLeaveDurationMinutes = null, clientRequestId = null, adminBlackoutOverride = false
}) {
  const requesterId = requesterUser._id || requesterUser.id;
  assertValidDayType(dayType);
  assertValidDateRange(startDate, endDate);
  if (dayType !== 'FULL_DAY' && String(startDate).slice(0, 10) !== String(endDate).slice(0, 10)) {
    throw new ErrorResponse('Half-day and short leave requests must be for a single date', 400);
  }

  const workspace = await Workspace.findById(workspaceId).select('timezone').lean();
  const timezone = getWorkspaceTimezone(workspace);

  const leaveType = await LeaveType.findOne({ _id: leaveTypeId, workspaceId, isActive: true }).lean();
  if (!leaveType) throw new ErrorResponse('Leave type not found or inactive', 404);

  const policyContext = await resolvePolicyContext({
    workspaceId, userId: requesterId, membership: requesterUser, date: new Date(startDate)
  });
  if (!policyContext) throw new ErrorResponse('No leave policy is assigned to you', 403);
  const { policyVersion } = policyContext;
  if (policyVersion.status !== 'published') {
    throw new ErrorResponse('The applicable leave policy version is not currently active', 409);
  }
  const policyRule = findLeaveTypeRule(policyVersion, leaveType._id);
  if (!policyRule) throw new ErrorResponse('This leave type is not covered by your assigned policy', 403);

  const profile = await getEffectiveEmploymentProfile({ workspaceId, userId: requesterId });
  assertEmploymentEligible({ employmentStatus: profile.employmentStatus, eligibleStatuses: policyRule.eligibleEmploymentStatuses });

  assertDayTypeMatchesLeaveTypeCategory({ leaveType, dayType });
  if (leaveType.category === 'SHORT_LEAVE') {
    assertShortLeaveDuration({ leaveType, policyRule, durationMinutes: shortLeaveDurationMinutes });
  }
  assertHalfDayAllowed({ leaveType, policyRule, dayType });

  const existingRequests = await LeaveRequest.find({ workspaceId, requester: requesterId }).lean();
  assertNoOverlap({ existingRequests, startDate, endDate });

  const departmentIds = requesterUser.department || [];
  const calendarContext = await buildCalendarContext({ timezone, departmentIds });
  const primaryDepartmentId = departmentIds[0] || null;

  const days = [];
  for (const date of eachCalendarDate(startDate, endDate, timezone)) {
    const { classification } = classifyDateWithContext(calendarContext, date, primaryDepartmentId);
    const isOffCalendarDay = classification === 'HOLIDAY' || classification === 'WEEKLY_OFF';
    const isConsuming = !isOffCalendarDay || policyRule.weekendHolidayHandling === 'INCLUDE_IN_CONSUMPTION';
    const faceValueAmount = DAY_UNIT_BY_TYPE[dayType] ?? 1;

    days.push({
      date,
      calendarClassification: classification,
      dayType,
      isConsuming,
      requestedAmount: faceValueAmount,
      shortLeaveStartTime: dayType === 'SHORT_LEAVE' ? shortLeaveStartTime : null,
      shortLeaveEndTime: dayType === 'SHORT_LEAVE' ? shortLeaveEndTime : null,
      shortLeaveDurationMinutes: dayType === 'SHORT_LEAVE' ? shortLeaveDurationMinutes : null
    });
  }
  if (days.length === 0) throw new ErrorResponse('Leave request must cover at least one date', 400);

  const totalRequestedDayUnits = days.reduce((sum, day) => sum + day.requestedAmount, 0);
  const totalConsumingDayUnits = days.reduce((sum, day) => sum + (day.isConsuming ? day.requestedAmount : 0), 0);
  if (totalConsumingDayUnits <= 0) {
    throw new ErrorResponse('This date range does not include any working day that would consume leave', 400);
  }

  const workflow = await getOrCreateActiveWorkflow(workspaceId);
  const { hasMatch: blackoutHit } = checkBlackout({
    blackoutDates: policyVersion.blackout?.dates, startDate, endDate, requestDepartmentIds: departmentIds
  });
  let blackoutOverride = { warned: false, adminOverrodeBy: null, overriddenAt: null };
  if (blackoutHit) {
    if (workflow.blackoutDateBehavior === 'BLOCK') {
      throw new ErrorResponse('These dates fall within a blackout period and cannot be requested', 403);
    }
    if (workflow.blackoutDateBehavior === 'REQUIRE_ADMIN_OVERRIDE' && !adminBlackoutOverride) {
      throw new ErrorResponse('These dates fall within a blackout period and require an Admin override', 403);
    }
    blackoutOverride = { warned: true, adminOverrodeBy: adminBlackoutOverride ? requesterId : null, overriddenAt: new Date() };
  }

  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const [request] = await LeaveRequest.create([{
        workspaceId, requester: requesterId, requesterDepartmentIds: departmentIds,
        leaveType: leaveType._id, policyVersion: policyVersion._id, startDate, endDate,
        totalRequestedDayUnits, totalConsumingDayUnits, reason,
        status: LEAVE_REQUEST_STATUSES.PENDING_APPROVAL, blackoutOverride, clientRequestId, createdBy: requesterId
      }], { session });

      await LeaveRequestDay.insertMany(
        days.map((day) => ({ workspaceId, request: request._id, ...day })),
        { session }
      );

      await reserveFromBuckets({
        workspaceId, user: requesterId, leaveType: leaveType._id, amount: totalConsumingDayUnits,
        request: request._id, actor: requesterId, session
      });

      const approvalLevels = await generateApprovalChain({
        workspaceId, request, requesterMembership: requesterUser, workflow, session
      });
      if (request.isModified('blockedReason')) await request.save({ session });

      await AuditLog.create([auditEntry({
        workspaceId, actor: requesterId, action: 'LEAVE_REQUEST_SUBMITTED', targetId: request._id,
        before: null, after: { leaveType: leaveType.key, startDate, endDate, totalConsumingDayUnits }
      })], { session });

      created = { request: request.toObject(), days, approvalLevels: approvalLevels.map((l) => l.toObject()) };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }

  try {
    await leaveHooks.onRequestSubmitted(created.request, requesterId);
    await leaveHooks.onApprovalRequired(created.request, created.approvalLevels, requesterId);
  } catch (error) {
    console.error('[Leave] post-submit notification error:', error.message);
  }

  try {
    await Promise.all(created.approvalLevels.map((level) => scheduleApprovalReminders(level, workflow)));
  } catch (error) {
    console.error('[Leave] post-submit reminder-scheduling error:', error.message);
  }

  return created;
}

/** Employee cancels their own still-pending/partially-approved request. */
export async function cancelPendingRequest({ workspaceId, requestId, actor }) {
  const actorId = actor._id || actor.id;
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await LeaveRequest.findOne({ _id: requestId, workspaceId }).session(session);
      if (!request) throw new ErrorResponse('Leave request not found', 404);
      if (String(request.requester) !== String(actorId)) {
        throw new ErrorResponse('You can only cancel your own leave request', 403);
      }
      if (![LEAVE_REQUEST_STATUSES.PENDING_APPROVAL, LEAVE_REQUEST_STATUSES.PARTIALLY_APPROVED].includes(request.status)) {
        throw new ErrorResponse('Only a pending request can be cancelled this way', 409);
      }

      const pendingLevels = await LeaveApproval.find({ workspaceId, request: request._id, status: 'PENDING' }).session(session);
      await LeaveApproval.updateMany(
        { workspaceId, request: request._id, status: 'PENDING' },
        { $set: { status: 'VOIDED' } },
        { session }
      );

      await releaseReservationsForRequest({ workspaceId, request: request._id, reason: 'Cancelled by requester', actor: actorId, session });

      request.status = LEAVE_REQUEST_STATUSES.CANCELLED_BY_REQUESTER;
      request.cancellation = {
        requestedAt: new Date(), requestedBy: actorId, requestedReason: '',
        decidedAt: new Date(), decidedBy: actorId, decision: 'approved',
        finalizedAt: new Date(), finalizedBy: actorId, finalReason: 'Cancelled while pending'
      };
      await request.save({ session });

      await AuditLog.create([auditEntry({
        workspaceId, actor: actorId, action: 'LEAVE_REQUEST_CANCELLED_BY_REQUESTER', targetId: request._id,
        before: { status: 'PENDING_APPROVAL' }, after: { status: request.status }
      })], { session });

      result = { request: request.toObject(), pendingLevels: pendingLevels.map((l) => l.toObject()) };
    });
  } finally {
    await session.endSession();
  }

  try {
    await leaveHooks.onRequestCancelled(result.request, actorId, result.pendingLevels);
  } catch (error) {
    console.error('[Leave] post-cancel notification error:', error.message);
  }
  return result;
}

/** Employee requests cancellation of an already-approved leave — HR/Admin must decide. */
export async function requestCancellationOfApprovedLeave({ workspaceId, requestId, actor, reason }) {
  const actorId = actor._id || actor.id;
  const request = await LeaveRequest.findOne({ _id: requestId, workspaceId });
  if (!request) throw new ErrorResponse('Leave request not found', 404);
  if (String(request.requester) !== String(actorId)) {
    throw new ErrorResponse('You can only request cancellation of your own leave', 403);
  }
  if (request.status !== LEAVE_REQUEST_STATUSES.APPROVED) {
    throw new ErrorResponse('Only an approved request can have its cancellation requested', 409);
  }

  request.status = LEAVE_REQUEST_STATUSES.CANCELLATION_REQUESTED;
  request.cancellation = {
    ...request.cancellation?.toObject?.() || {},
    requestedAt: new Date(), requestedBy: actorId, requestedReason: reason || ''
  };
  await request.save();

  await AuditLog.create(auditEntry({
    workspaceId, actor: actorId, action: 'LEAVE_CANCELLATION_REQUESTED', targetId: request._id,
    before: { status: 'APPROVED' }, after: { status: request.status, reason }
  }));

  const [hrIds, adminIds] = await Promise.all([
    resolveActiveMembersByRole({ workspaceId, role: 'hr', excludeUserId: actorId }),
    resolveActiveMembersByRole({ workspaceId, role: 'admin', excludeUserId: actorId })
  ]);
  try {
    await leaveHooks.onCancellationRequested(request.toObject(), actorId, [...hrIds, ...adminIds]);
  } catch (error) {
    console.error('[Leave] post-cancellation-request notification error:', error.message);
  }

  return request.toObject();
}

/**
 * Shared restore mechanics for both cancellation paths — an employee's
 * approved cancellation request being granted, and HR/Admin directly
 * cancelling an approved leave (e.g. the employee ended up working that
 * day). Never deletes the original approval; always a compensating ledger
 * transaction. Existing task-tracked time for the affected dates is never
 * touched — that lives entirely in Card/Subtask/SubtaskNano, an unrelated
 * collection this function never queries.
 */
async function finalizeApprovedCancellation({ workspaceId, request, actor, reason, resultingStatus, session }) {
  const actorId = actor._id || actor.id;

  await restoreConsumptionForRequest({
    workspaceId, request: request._id, reason: reason || 'Approved leave cancelled', actor: actorId, session,
    resolveFreshExpiry: async (leaveTypeId, policyVersionId) => {
      const policyVersion = await LeavePolicyVersion.findOne({ _id: policyVersionId, workspaceId }).session(session);
      const rule = policyVersion ? findLeaveTypeRule(policyVersion, leaveTypeId) : null;
      const workspaceDoc = await Workspace.findById(workspaceId).select('timezone').session(session);
      const timezone = getWorkspaceTimezone(workspaceDoc);
      return rule ? computeExpiryDate(new Date(), rule.expiryRule, timezone) : null;
    }
  });

  const statusBefore = request.status;
  request.status = resultingStatus;
  request.cancellation = {
    ...(request.cancellation?.toObject?.() || request.cancellation || {}),
    decidedAt: request.cancellation?.decidedAt || new Date(),
    decidedBy: request.cancellation?.decidedBy || actorId,
    decision: 'approved',
    finalizedAt: new Date(),
    finalizedBy: actorId,
    finalReason: reason || ''
  };
  await request.save({ session });

  await AuditLog.create([auditEntry({
    workspaceId, actor: actorId, action: `LEAVE_${resultingStatus}`, targetId: request._id,
    before: { status: statusBefore }, after: { status: resultingStatus, reason }
  })], { session });

  return request;
}

function statusForActorRole(actorRole) {
  return actorRole === 'admin' ? LEAVE_REQUEST_STATUSES.CANCELLED_BY_ADMIN : LEAVE_REQUEST_STATUSES.CANCELLED_BY_HR;
}

/** HR/Admin decides a pending cancellation request (approve = finalize the restore; reject = leave stands). */
export async function decideCancellationRequest({ workspaceId, requestId, actor, decision, reason }) {
  const actorId = actor._id || actor.id;
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await LeaveRequest.findOne({ _id: requestId, workspaceId }).session(session);
      if (!request) throw new ErrorResponse('Leave request not found', 404);
      if (request.status !== LEAVE_REQUEST_STATUSES.CANCELLATION_REQUESTED) {
        throw new ErrorResponse('This request has no pending cancellation to decide', 409);
      }

      if (decision === 'rejected') {
        request.status = LEAVE_REQUEST_STATUSES.APPROVED;
        request.cancellation = {
          ...(request.cancellation?.toObject?.() || {}),
          decidedAt: new Date(), decidedBy: actorId, decision: 'rejected',
          finalizedAt: new Date(), finalizedBy: actorId, finalReason: reason || ''
        };
        await request.save({ session });
        await AuditLog.create([auditEntry({
          workspaceId, actor: actorId, action: 'LEAVE_CANCELLATION_REJECTED', targetId: request._id,
          before: { status: 'CANCELLATION_REQUESTED' }, after: { status: request.status, reason }
        })], { session });
        result = { request: request.toObject(), decision: 'rejected' };
        return;
      }

      const finalized = await finalizeApprovedCancellation({
        workspaceId, request, actor, reason, resultingStatus: statusForActorRole(actor.role), session
      });
      result = { request: finalized.toObject(), decision: 'approved' };
    });
  } finally {
    await session.endSession();
  }

  try {
    if (result.decision === 'approved') await leaveHooks.onCancelledByHr(result.request, actorId, reason);
  } catch (error) {
    console.error('[Leave] post-cancellation-decision notification error:', error.message);
  }
  return result;
}

/** HR/Admin cancels an already-approved leave directly (no prior employee request) — spec's "HR cancels on the day" flow. */
export async function cancelApprovedLeaveDirectly({ workspaceId, requestId, actor, reason }) {
  if (!reason || !reason.trim()) {
    throw new ErrorResponse('A reason is required to cancel an approved leave', 400);
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await LeaveRequest.findOne({ _id: requestId, workspaceId }).session(session);
      if (!request) throw new ErrorResponse('Leave request not found', 404);
      if (![LEAVE_REQUEST_STATUSES.APPROVED, LEAVE_REQUEST_STATUSES.CANCELLATION_REQUESTED].includes(request.status)) {
        throw new ErrorResponse('Only an approved leave can be cancelled this way', 409);
      }
      const finalized = await finalizeApprovedCancellation({
        workspaceId, request, actor, reason, resultingStatus: statusForActorRole(actor.role), session
      });
      result = finalized.toObject();
    });
  } finally {
    await session.endSession();
  }

  const actorId = actor._id || actor.id;
  try {
    await leaveHooks.onCancelledByHr(result, actorId, reason);
  } catch (error) {
    console.error('[Leave] post-hr-cancel notification error:', error.message);
  }
  return result;
}

export async function getRequestDetail({ workspaceId, requestId }) {
  const request = await LeaveRequest.findOne({ _id: requestId, workspaceId })
    .populate('requester', 'name email avatar')
    .populate('leaveType', 'name key category color')
    .lean();
  if (!request) throw new ErrorResponse('Leave request not found', 404);
  const days = await LeaveRequestDay.find({ workspaceId, request: requestId }).sort({ date: 1 }).lean();
  const approvals = await LeaveApproval.find({ workspaceId, request: requestId }).sort({ level: 1 })
    .populate('decidedBy', 'name email avatar')
    .lean();
  return { request, days, approvals };
}

export async function listMyRequests({ workspaceId, userId, status = null }) {
  const filter = { workspaceId, requester: userId };
  if (status) filter.status = status;
  return LeaveRequest.find(filter).sort({ createdAt: -1 }).populate('leaveType', 'name key category color').lean();
}

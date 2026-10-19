import mongoose from 'mongoose';
import AttendanceRegularization from './attendanceRegularization.model.js';
import AttendanceDay from './attendanceDay.model.js';
import AttendanceSession from './attendanceSession.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { resolveAttendanceEligibility } from './attendanceEligibility.service.js';
import { resolveApplicablePolicyVersion } from './attendancePolicy.service.js';
import { generateApprovalLevels, registerApprovalEntityHandler } from './attendanceApproval.service.js';
import { codedError } from './attendanceErrors.js';
import {applyApprovedRegularization,deliverRegularizationUpdate} from './attendanceRegularizationApplication.service.js';
import {correctedAttendanceInterval,effectiveAttendanceSession} from './attendanceRegularizationOverlay.js';
import * as attendanceHooks from './attendanceHooks.js';

/** Approved corrections preserve raw evidence while materializing a verified
 * effective interval and resolution metadata in the same approval transaction. */
export async function submitRegularization({ workspaceId, userId, membership, workspace, workDateKey, type, proposedCorrection, reason, createdBy }) {
  if (!reason?.trim()) throw new ErrorResponse('A reason is required', 400);
  if (!proposedCorrection?.checkInAt && !proposedCorrection?.checkOutAt) {
    throw new ErrorResponse('A proposed check-in and/or check-out time is required', 400);
  }

  const eligibility = await resolveAttendanceEligibility({ workspaceId, userId, membership, workspace });
  if (!eligibility.attendanceRequired) throw codedError('Attendance does not apply to your account in this workspace.', 403, 'ATTENDANCE_NOT_REQUIRED');

  const policyVersion = await resolveApplicablePolicyVersion({ workspaceId });
  if (!policyVersion) throw codedError('Attendance has not been fully configured for this workspace yet.', 400, 'POLICY_NOT_CONFIGURED');
  if (!policyVersion.regularization?.enabled) throw codedError('Regularization is not enabled for this workspace.', 400, 'REGULARIZATION_NOT_ALLOWED');
  if (!(policyVersion.regularization.allowedTypes || []).includes(type)) {
    throw codedError('This regularization type is not allowed by policy.', 400, 'REGULARIZATION_NOT_ALLOWED');
  }

  const existingDay = await AttendanceDay.findOne({ workspaceId, user: userId, workDateKey }).lean();
  const existingSessions = await AttendanceSession.find({ workspaceId, user: userId, workDateKey }).sort({ checkInAt: 1 }).lean();
  // The most recent session is the natural target for a correction unless
  // the request is genuinely about a day with zero raw evidence at all
  // (MISSED_CHECK_IN/FORGOTTEN_ATTENDANCE with no session ever created).
  const targetSession = existingSessions[existingSessions.length - 1] || null;

  const originalSnapshot = {
    presenceState: existingDay?.presenceState || 'NOT_STARTED',
    workedMinutes: existingDay?.workedMinutes || 0,
    checkInAt: targetSession?.checkInAt || null,
    checkOutAt: targetSession?.checkOutAt || null
  };

  correctedAttendanceInterval(targetSession?effectiveAttendanceSession(targetSession):{},proposedCorrection);
  const requireApproval = Boolean(policyVersion.regularization.requireApproval);
  const dbSession=await mongoose.startSession();let request,approvalLevels=[];
  try{await dbSession.withTransaction(async()=>{
  [request] = await AttendanceRegularization.create([{
    workspaceId, requester: userId, workDateKey, attendanceDay: existingDay?._id || null,
    attendanceSession: targetSession?._id || null, type, originalSnapshot, proposedCorrection, reason,
    status: requireApproval ? 'PENDING_APPROVAL' : 'APPROVED',
    finalCorrection: requireApproval ? null : proposedCorrection,
    decidedAt: requireApproval ? null : new Date(), createdBy
  }],{session:dbSession});
  if (requireApproval) {
    approvalLevels = await generateApprovalLevels({
      workspaceId, entityType: 'REGULARIZATION_REQUEST', entityId: request._id, requesterId: userId,
      requesterMembership: membership, approverLevels: policyVersion.regularization.approverLevels, session:dbSession
    });
  } else {
    await applyApprovedRegularization(request,dbSession);
  }

  if(requireApproval&&targetSession&&!targetSession.regularizationResolution?.appliedAt)await AttendanceSession.updateOne({_id:targetSession._id,workspaceId,user:userId},{$set:{regularizationStatus:'PENDING_APPROVAL'}},{session:dbSession});
  });}finally{await dbSession.endSession();}
  try {
    if(!requireApproval)await deliverRegularizationUpdate(request);
    await attendanceHooks.onRegularizationSubmitted(request, userId);
    if (approvalLevels.length) await attendanceHooks.onRegularizationApprovalRequired(request, approvalLevels, userId);
  } catch (error) {
    console.error('[Attendance] regularization submission notification error:', error.message);
  }

  return request;
}

export async function listMyRegularizations({ workspaceId, userId }) {
  return AttendanceRegularization.find({ workspaceId, requester: userId }).sort({ createdAt: -1 }).lean();
}

export async function cancelRegularization({ workspaceId, requestId, userId }) {
  const request = await AttendanceRegularization.findOne({ _id: requestId, workspaceId, requester: userId });
  if (!request) throw new ErrorResponse('Regularization request not found', 404);
  if (request.status !== 'PENDING_APPROVAL') throw new ErrorResponse('Only a pending request can be cancelled', 400);
  request.status = 'CANCELLED';
  await request.save();
  return request;
}

/**
 * Authorized Admin/HR manual correction (spec §55) — same underlying
 * mechanism as an approved regularization (an overlay, never a rewrite of
 * raw evidence), but created and applied in one step by someone with
 * `correct_attendance` permission rather than going through the approval
 * queue. Still requires a reason and still recorded as its own
 * AttendanceRegularization row (already APPROVED) for a complete audit trail.
 */
export async function submitManualCorrection({ workspaceId, targetUserId, membership, workspace, workDateKey, type, correction, reason, actorId }) {
  if (!reason?.trim()) throw new ErrorResponse('A reason is required for a manual correction', 400);

  const existingDay = await AttendanceDay.findOne({ workspaceId, user: targetUserId, workDateKey }).lean();
  const existingSessions = await AttendanceSession.find({ workspaceId, user: targetUserId, workDateKey }).sort({ checkInAt: 1 }).lean();
  const targetSession = existingSessions[existingSessions.length - 1] || null;

  const originalSnapshot = {
    presenceState: existingDay?.presenceState || 'NOT_STARTED',
    workedMinutes: existingDay?.workedMinutes || 0,
    checkInAt: targetSession?.checkInAt || null,
    checkOutAt: targetSession?.checkOutAt || null
  };

  correctedAttendanceInterval(targetSession?effectiveAttendanceSession(targetSession):{},correction);
  const dbSession=await mongoose.startSession();let record;
  try{await dbSession.withTransaction(async()=>{
  [record] = await AttendanceRegularization.create([{
    workspaceId, requester: targetUserId, workDateKey, attendanceDay: existingDay?._id || null,
    attendanceSession: targetSession?._id || null, type, originalSnapshot, proposedCorrection: correction,
    finalCorrection: correction, reason, status: 'APPROVED', decidedAt: new Date(), createdBy: actorId
  }],{session:dbSession});
  await applyApprovedRegularization(record,dbSession);
  });}finally{await dbSession.endSession();}
  try{await deliverRegularizationUpdate(record);}catch(error){console.error('[Attendance] correction event delivery will retry:',error.message);}
  return record;
}

registerApprovalEntityHandler('REGULARIZATION_REQUEST', {
  load: (entityId, dbSession) => AttendanceRegularization.findById(entityId).session(dbSession),
  loadSummaries: (entityIds) => AttendanceRegularization.find({ _id: { $in: entityIds } }).populate('requester', 'name email avatar').select('requester workDateKey type reason status').lean(),
  // Runs INSIDE the approval decision's transaction (matching
  // leaveApproval.service.js's discipline: every real mutation commits
  // atomically with the decision itself; only notifications happen after
  // and get swallowed on failure — see afterCommit below). Recomputing
  // AttendanceDay here, on the same dbSession, means the decision and the
  // day it affects can never disagree, even if the process crashes
  // between the two — either both commit or neither does.
  onFinalOutcome: async (entity, finalOutcome, dbSession) => {
    entity.status = finalOutcome === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    entity.decidedAt = new Date();
    if (finalOutcome === 'APPROVED') entity.finalCorrection = entity.proposedCorrection;
    await entity.save({ session: dbSession });

    if (finalOutcome === 'APPROVED') {
      await applyApprovedRegularization(entity,dbSession);
    } else if(entity.attendanceSession){
      const pending=await AttendanceRegularization.exists({workspaceId:entity.workspaceId,requester:entity.requester,attendanceSession:entity.attendanceSession,status:'PENDING_APPROVAL'}).session(dbSession);
      await AttendanceSession.updateOne({_id:entity.attendanceSession,workspaceId:entity.workspaceId,user:entity.requester,'regularizationResolution.appliedAt':null},{$set:{regularizationStatus:pending?'PENDING_APPROVAL':'REJECTED'}},{session:dbSession});
    }
  },
  afterCommit: async (result, actor) => {
    try{if(result.finalOutcome==='APPROVED')await deliverRegularizationUpdate(result.entity);}
    finally{await attendanceHooks.onRegularizationDecided(result, actor);}
  }
});

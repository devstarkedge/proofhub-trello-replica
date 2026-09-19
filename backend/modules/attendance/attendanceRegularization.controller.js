import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { submitRegularization, listMyRegularizations, cancelRegularization, submitManualCorrection } from './attendanceRegularization.service.js';
import { decideApproval, getApprovalQueue, getApprovalTimeline } from './attendanceApproval.service.js';

function membershipFromReq(req) {
  return { role: req.user.role, department: req.user.department, status: 'active' };
}

export const listMine = asyncHandler(async (req, res) => {
  const requests = await listMyRegularizations({ workspaceId: req.workspaceId, userId: req.user.id });
  res.json({ success: true, data: requests });
});

export const submit = asyncHandler(async (req, res) => {
  const { workDateKey, type, proposedCorrection, reason } = req.body;
  if (!workDateKey || !type) throw new ErrorResponse('workDateKey and type are required', 400);

  const workspace = await Workspace.findById(req.workspaceId).select('attendanceModuleEnabled timezone').lean();
  const request = await submitRegularization({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req), workspace,
    workDateKey, type, proposedCorrection, reason, createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_REGULARIZATION_REQUESTED', targetType: 'AttendanceRegularization', targetId: request._id,
    resourceLabel: `Regularization: ${req.user.name}`, summary: `${req.user.name} requested an attendance regularization`,
    before: null, after: request.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: request });
});

export const cancel = asyncHandler(async (req, res) => {
  const request = await cancelRegularization({ workspaceId: req.workspaceId, requestId: req.params.requestId, userId: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_REGULARIZATION_CANCELLED', targetType: 'AttendanceRegularization', targetId: request._id,
    resourceLabel: `Regularization: ${req.user.name}`, summary: `${req.user.name} cancelled their regularization request`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: request });
});

export const listApprovalQueue = asyncHandler(async (req, res) => {
  const queue = await getApprovalQueue({ workspaceId: req.workspaceId, userId: req.user.id, entityType: 'REGULARIZATION_REQUEST' });
  res.json({ success: true, data: queue });
});

export const decide = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body;
  const result = await decideApproval({ workspaceId: req.workspaceId, approvalId: req.params.approvalId, actor: req.user, decision, comment });
  await recordAuditLog({
    actor: req.user, action: `ATTENDANCE_REGULARIZATION_${decision}`, targetType: 'AttendanceRegularization', targetId: result.entity._id,
    resourceLabel: 'Regularization Decision', summary: `${req.user.name} ${decision === 'APPROVED' ? 'approved' : 'rejected'} a regularization request`,
    before: null, after: { decision, comment, finalOutcome: result.finalOutcome }, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: result });
});

export const timeline = asyncHandler(async (req, res) => {
  const rows = await getApprovalTimeline({ workspaceId: req.workspaceId, entityType: 'REGULARIZATION_REQUEST', entityId: req.params.requestId });
  res.json({ success: true, data: rows });
});

export const manualCorrection = asyncHandler(async (req, res) => {
  const { targetUserId, workDateKey, type, correction, reason } = req.body;
  if (!targetUserId || !workDateKey || !type || !correction) throw new ErrorResponse('targetUserId, workDateKey, type and correction are required', 400);

  const workspace = await Workspace.findById(req.workspaceId).select('attendanceModuleEnabled timezone').lean();
  const targetMembership = await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: targetUserId }).lean();
  if (!targetMembership) throw new ErrorResponse('Target member not found in this workspace', 404);

  const record = await submitManualCorrection({
    workspaceId: req.workspaceId, targetUserId, membership: targetMembership, workspace, workDateKey, type, correction, reason, actorId: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_MANUAL_CORRECTION', targetType: 'AttendanceRegularization', targetId: record._id,
    resourceLabel: 'Manual Attendance Correction', summary: `${req.user.name} manually corrected an attendance record`,
    before: record.originalSnapshot, after: record.finalCorrection, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: record });
});

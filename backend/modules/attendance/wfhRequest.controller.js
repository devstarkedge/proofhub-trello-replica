import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { recordAuditLog } from '../permissions/auditLogService.js';
import { submitWfhRequest, listMyWfhRequests, cancelWfhRequest } from './wfhRequest.service.js';
import { decideApproval, getApprovalQueue, getApprovalTimeline } from './attendanceApproval.service.js';

function membershipFromReq(req) {
  return { role: req.user.role, department: req.user.department, status: 'active' };
}

export const listMine = asyncHandler(async (req, res) => {
  const requests = await listMyWfhRequests({ workspaceId: req.workspaceId, userId: req.user.id });
  res.json({ success: true, data: requests });
});

export const submit = asyncHandler(async (req, res) => {
  const { startDate, endDate, reason, isRecurring } = req.body;
  if (!startDate || !endDate) throw new ErrorResponse('startDate and endDate are required', 400);

  const workspace = await Workspace.findById(req.workspaceId).select('attendanceModuleEnabled timezone').lean();
  const request = await submitWfhRequest({
    workspaceId: req.workspaceId, userId: req.user.id, membership: membershipFromReq(req), workspace,
    startDate, endDate, reason, isRecurring, createdBy: req.user.id
  });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WFH_REQUESTED', targetType: 'WfhRequest', targetId: request._id,
    resourceLabel: `WFH Request: ${req.user.name}`, summary: `${req.user.name} requested work-from-home`,
    before: null, after: request.toObject(), category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.status(201).json({ success: true, data: request });
});

export const cancel = asyncHandler(async (req, res) => {
  const request = await cancelWfhRequest({ workspaceId: req.workspaceId, requestId: req.params.requestId, userId: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'ATTENDANCE_WFH_CANCELLED', targetType: 'WfhRequest', targetId: request._id,
    resourceLabel: `WFH Request: ${req.user.name}`, summary: `${req.user.name} cancelled their work-from-home request`,
    before: null, after: null, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: request });
});

export const listApprovalQueue = asyncHandler(async (req, res) => {
  const queue = await getApprovalQueue({ workspaceId: req.workspaceId, userId: req.user.id, entityType: 'WFH_REQUEST' });
  res.json({ success: true, data: queue });
});

export const decide = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body;
  const result = await decideApproval({ workspaceId: req.workspaceId, approvalId: req.params.approvalId, actor: req.user, decision, comment });
  await recordAuditLog({
    actor: req.user, action: `ATTENDANCE_WFH_${decision}`, targetType: 'WfhRequest', targetId: result.entity._id,
    resourceLabel: 'WFH Approval Decision', summary: `${req.user.name} ${decision === 'APPROVED' ? 'approved' : 'rejected'} a work-from-home request`,
    before: null, after: { decision, comment, finalOutcome: result.finalOutcome }, category: 'attendance_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: result });
});

export const timeline = asyncHandler(async (req, res) => {
  const rows = await getApprovalTimeline({ workspaceId: req.workspaceId, entityType: 'WFH_REQUEST', entityId: req.params.requestId });
  res.json({ success: true, data: rows });
});

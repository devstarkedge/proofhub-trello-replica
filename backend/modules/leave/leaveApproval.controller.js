import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as leaveApprovalService from './leaveApproval.service.js';
import * as leaveRequestService from './leaveRequest.service.js';

export const getApprovalQueue = asyncHandler(async (req, res) => {
  const queue = await leaveApprovalService.getApprovalQueue({ workspaceId: req.workspaceId, userId: req.user.id });
  res.json({ success: true, data: queue });
});

export const decideApproval = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw new ErrorResponse('decision must be APPROVED or REJECTED', 400);
  const result = await leaveApprovalService.decideApproval({
    workspaceId: req.workspaceId, approvalId: req.params.approvalId, actor: req.user, decision, comment
  });
  res.json({ success: true, data: result });
});

export const getApprovalTimeline = asyncHandler(async (req, res) => {
  const timeline = await leaveApprovalService.getApprovalTimeline({ workspaceId: req.workspaceId, requestId: req.params.requestId });
  res.json({ success: true, data: timeline });
});

export const decideCancellationRequest = asyncHandler(async (req, res) => {
  const { decision, reason } = req.body;
  if (!['approved', 'rejected'].includes(decision)) throw new ErrorResponse('decision must be approved or rejected', 400);
  const result = await leaveRequestService.decideCancellationRequest({
    workspaceId: req.workspaceId, requestId: req.params.requestId, actor: req.user, decision, reason
  });
  res.json({ success: true, data: result });
});

export const cancelApprovedLeave = asyncHandler(async (req, res) => {
  const result = await leaveRequestService.cancelApprovedLeaveDirectly({
    workspaceId: req.workspaceId, requestId: req.params.requestId, actor: req.user, reason: req.body.reason
  });
  res.json({ success: true, data: result });
});

import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as leaveRequestService from './leaveRequest.service.js';
import { canViewUserLeaveData } from './leaveAuthorization.service.js';

export const submitRequest = asyncHandler(async (req, res) => {
  const {
    leaveTypeId, startDate, endDate, dayType, reason,
    shortLeaveStartTime, shortLeaveEndTime, shortLeaveDurationMinutes, clientRequestId
  } = req.body;
  if (!leaveTypeId || !startDate || !endDate) {
    throw new ErrorResponse('leaveTypeId, startDate, and endDate are required', 400);
  }
  const created = await leaveRequestService.submitLeaveRequest({
    workspaceId: req.workspaceId, requesterUser: req.user, leaveTypeId, startDate, endDate, dayType, reason,
    shortLeaveStartTime, shortLeaveEndTime, shortLeaveDurationMinutes, clientRequestId
  });
  res.status(201).json({ success: true, data: created });
});

export const cancelPendingRequest = asyncHandler(async (req, res) => {
  const result = await leaveRequestService.cancelPendingRequest({
    workspaceId: req.workspaceId, requestId: req.params.requestId, actor: req.user
  });
  res.json({ success: true, data: result });
});

export const requestCancellation = asyncHandler(async (req, res) => {
  const request = await leaveRequestService.requestCancellationOfApprovedLeave({
    workspaceId: req.workspaceId, requestId: req.params.requestId, actor: req.user, reason: req.body.reason
  });
  res.json({ success: true, data: request });
});

export const getMyRequests = asyncHandler(async (req, res) => {
  const requests = await leaveRequestService.listMyRequests({
    workspaceId: req.workspaceId, userId: req.user.id, status: req.query.status || null
  });
  res.json({ success: true, data: requests });
});

export const getUserRequests = asyncHandler(async (req, res) => {
  const allowed = await canViewUserLeaveData({ viewer: req.user, targetUserId: req.params.userId, workspaceId: req.workspaceId });
  if (!allowed) throw new ErrorResponse('You do not have permission to view this employee\'s leave history', 403);
  const requests = await leaveRequestService.listMyRequests({
    workspaceId: req.workspaceId, userId: req.params.userId, status: req.query.status || null
  });
  res.json({ success: true, data: requests });
});

export const getRequestDetail = asyncHandler(async (req, res) => {
  const detail = await leaveRequestService.getRequestDetail({ workspaceId: req.workspaceId, requestId: req.params.requestId });
  const isRequester = String(detail.request.requester._id || detail.request.requester) === String(req.user.id);
  if (!isRequester) {
    const allowed = await canViewUserLeaveData({
      viewer: req.user, targetUserId: detail.request.requester._id || detail.request.requester, workspaceId: req.workspaceId
    });
    const isApprover = detail.approvals.some((approval) =>
      (approval.eligibleApproverUserIds || []).some((id) => String(id._id || id) === String(req.user.id))
    );
    if (!allowed && !isApprover) throw new ErrorResponse('You do not have permission to view this leave request', 403);
  }
  res.json({ success: true, data: detail });
});

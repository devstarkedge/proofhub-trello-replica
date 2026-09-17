import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as leaveRequestService from './leaveRequest.service.js';
import { canViewUserLeaveData, assertMyLeaveSelfServiceAllowed } from './leaveAuthorization.service.js';

export const submitRequest = asyncHandler(async (req, res) => {
  assertMyLeaveSelfServiceAllowed(req.user);
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
  assertMyLeaveSelfServiceAllowed(req.user);
  const result = await leaveRequestService.cancelPendingRequest({
    workspaceId: req.workspaceId, requestId: req.params.requestId, actor: req.user
  });
  res.json({ success: true, data: result });
});

export const requestCancellation = asyncHandler(async (req, res) => {
  assertMyLeaveSelfServiceAllowed(req.user);
  const request = await leaveRequestService.requestCancellationOfApprovedLeave({
    workspaceId: req.workspaceId, requestId: req.params.requestId, actor: req.user, reason: req.body.reason
  });
  res.json({ success: true, data: request });
});

export const getMyRequests = asyncHandler(async (req, res) => {
  assertMyLeaveSelfServiceAllowed(req.user);
  const requests = await leaveRequestService.listMyRequests({
    workspaceId: req.workspaceId, userId: req.user.id, status: req.query.status || null
  });
  res.json({ success: true, data: requests });
});

export const getUserRequests = asyncHandler(async (req, res) => {
  // Closes the same self-via-other-route loophole as getUserBalance — an
  // Admin viewing someone else's history is unaffected.
  if (String(req.params.userId) === String(req.user.id)) assertMyLeaveSelfServiceAllowed(req.user);

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
  // An Admin viewing a request where THEY are the requester is the one
  // My-Leave-shaped case this endpoint can produce — reject it, but only
  // that case: viewing anyone else's request (approval queue, dashboards)
  // must keep working for Admin exactly as before.
  if (isRequester) assertMyLeaveSelfServiceAllowed(req.user);
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

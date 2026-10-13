import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import * as leaveRequestService from './leaveRequest.service.js';
import { assertMyLeaveSelfServiceAllowed } from './leaveAuthorization.service.js';
import { getAuthorizedRequestDetail } from './leaveRequestQuery.service.js';
import { resolveLeaveReadScope } from './leaveRead.service.js';
import LeaveRequest from './leaveRequest.model.js';

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
  res.status(created.replayed ? 200 : 201).json({ success: true, data: created });
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

  const scope = await resolveLeaveReadScope({ viewer: req.user, workspaceId: req.workspaceId });
  const requests = await LeaveRequest.find({ $and: [scope, { requester: req.params.userId, ...(req.query.status ? { status: req.query.status } : {}) }] }).sort({ createdAt: -1 }).populate('leaveType', 'name key category color').lean();
  res.json({ success: true, data: requests });
});

export const getRequestDetail = asyncHandler(async (req, res) => {
  const detail = await getAuthorizedRequestDetail({ viewer: req.user, workspaceId: req.workspaceId, requestId: req.params.requestId });
  res.json({ success: true, data: detail });
});

import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { canViewUserLeaveData, assertMyLeaveSelfServiceAllowed } from './leaveAuthorization.service.js';

export const getMyBalance = asyncHandler(async (req, res) => {
  assertMyLeaveSelfServiceAllowed(req.user);
  const data = await getFullBalanceBreakdown({ workspaceId: req.workspaceId, user: req.user.id });
  res.json({ success: true, data });
});

export const getUserBalance = asyncHandler(async (req, res) => {
  // /balance/me is already blocked for Admin (leaveRequest.routes.js), but
  // this route can also be called with the caller's OWN id — close that
  // loophole here rather than letting an Admin reach their own balance via
  // a different URL, while everyone else's balance stays viewable by an
  // Admin exactly as before.
  if (String(req.params.userId) === String(req.user.id)) assertMyLeaveSelfServiceAllowed(req.user);

  const allowed = await canViewUserLeaveData({ viewer: req.user, targetUserId: req.params.userId, workspaceId: req.workspaceId });
  if (!allowed) throw new ErrorResponse('You do not have permission to view this employee\'s balance', 403);
  const data = await getFullBalanceBreakdown({ workspaceId: req.workspaceId, user: req.params.userId });
  res.json({ success: true, data });
});

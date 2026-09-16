import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getFullBalanceBreakdown } from './leaveBalance.service.js';
import { canViewUserLeaveData } from './leaveAuthorization.service.js';

export const getMyBalance = asyncHandler(async (req, res) => {
  const data = await getFullBalanceBreakdown({ workspaceId: req.workspaceId, user: req.user.id });
  res.json({ success: true, data });
});

export const getUserBalance = asyncHandler(async (req, res) => {
  const allowed = await canViewUserLeaveData({ viewer: req.user, targetUserId: req.params.userId, workspaceId: req.workspaceId });
  if (!allowed) throw new ErrorResponse('You do not have permission to view this employee\'s balance', 403);
  const data = await getFullBalanceBreakdown({ workspaceId: req.workspaceId, user: req.params.userId });
  res.json({ success: true, data });
});

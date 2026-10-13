import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getPersonalLeaveHistory, getPersonalLeaveActivity } from './leaveHistory.service.js';

export const getMyActivity = asyncHandler(async (req, res) => {
  if (req.query.userId || req.query.employeeId || req.query.workspaceId || req.query.viewer) throw new ErrorResponse('Personal history identity is determined by your active workspace session', 400);
  const data = await getPersonalLeaveHistory({ ...req.query, workspaceId: req.workspaceId, viewer: req.user });
  res.json({ success: true, data });
});
export const getMyActivityDetail = asyncHandler(async (req, res) => {
  const data = await getPersonalLeaveActivity({ workspaceId: req.workspaceId, viewer: req.user, activityId: req.params.activityId });
  res.json({ success: true, data });
});

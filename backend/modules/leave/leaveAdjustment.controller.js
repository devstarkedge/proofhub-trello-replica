import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { createManualAdjustment } from './leaveAdjustment.service.js';

export const createAdjustment = asyncHandler(async (req, res) => {
  const { userId, leaveTypeId, amount, reason } = req.body;
  if (!userId || !leaveTypeId || amount === undefined || amount === null) {
    throw new ErrorResponse('userId, leaveTypeId, and amount are required', 400);
  }
  const result = await createManualAdjustment({
    workspaceId: req.workspaceId, actor: req.user, userId, leaveTypeId, amount, reason
  });
  res.status(201).json({ success: true, data: result });
});

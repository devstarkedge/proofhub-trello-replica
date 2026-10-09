import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { createManualAdjustment } from './leaveAdjustment.service.js';

export const createAdjustment = asyncHandler(async (req, res) => {
  const { userId, leaveTypeId, amount, operation, count, reason, clientAdjustmentId } = req.body;
  if (!userId || !leaveTypeId || (amount === undefined && count === undefined)) {
    throw new ErrorResponse('Employee, leave type, operation, and leave count are required', 400);
  }
  const result = await createManualAdjustment({
    workspaceId: req.workspaceId, actor: req.user, userId, leaveTypeId, amount, operation, count, reason, clientAdjustmentId
  });
  res.status(201).json({ success: true, data: result });
});

import asyncHandler from '../../middleware/asyncHandler.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { createManualAdjustment, listManualAdjustments } from './leaveAdjustment.service.js';

export const createAdjustment = asyncHandler(async (req, res) => {
  const { userId, leaveTypeId, amount, operation, count, reason, clientAdjustmentId, expiryRule } = req.body;
  if (!userId || !leaveTypeId || (amount === undefined && count === undefined)) {
    throw new ErrorResponse('Employee, leave type, operation, and leave count are required', 400);
  }
  const result = await createManualAdjustment({
    workspaceId: req.workspaceId, actor: req.user, userId, leaveTypeId, amount, operation, count, reason, clientAdjustmentId, expiryRule
  });
  res.status(201).json({ success: true, data: result });
});

export const getAdjustments = asyncHandler(async (req, res) => {
  const { page, limit, userId, leaveTypeId, operation, startDate, endDate, search } = req.query;
  const result = await listManualAdjustments({
    workspaceId: req.workspaceId,
    page: page ? parseInt(page, 10) : 1,
    limit: limit ? parseInt(limit, 10) : 20,
    userId,
    leaveTypeId,
    operation,
    startDate,
    endDate,
    search
  });
  res.status(200).json({ success: true, data: result });
});

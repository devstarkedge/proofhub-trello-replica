import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { createReportSchedule, deleteReportSchedule, listReportSchedules } from '../services/analytics/analyticsReportService.js';

export const getAnalyticsReportSchedules = asyncHandler(async (req, res) => res.status(200).json({ success: true, data: await listReportSchedules(req.user) }));
export const postAnalyticsReportSchedule = asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await createReportSchedule(req.user, req.body) }));
export const removeAnalyticsReportSchedule = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ErrorResponse('Invalid report schedule id', 400);
  await deleteReportSchedule(req.user, req.params.id);
  res.status(200).json({ success: true });
});


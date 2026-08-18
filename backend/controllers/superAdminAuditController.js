import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { querySuperAdminAuditLog, getSuperAdminAuditLogDetail } from '../modules/superAdmin/superAdminAuditService.js';

// @desc    Platform-level Super Admin audit log, cursor-paginated
// @route   GET /api/super-admin/audit-log
// @access  Super Admin only
export const getAuditLog = asyncHandler(async (req, res) => {
  const { workspaceId, cursor, limit, sort, startDate, endDate, actorId, action, search } = req.query;
  const result = await querySuperAdminAuditLog({ workspaceId, cursor, limit, sort, startDate, endDate, actorId, action, search });
  res.status(200).json({ success: true, ...result });
});

// @desc    Full detail for one audit log entry (fetched on expand only)
// @route   GET /api/super-admin/audit-log/:id
// @access  Super Admin only
export const getAuditLogEntry = asyncHandler(async (req, res, next) => {
  const entry = await getSuperAdminAuditLogDetail(req.params.id);
  if (!entry) return next(new ErrorResponse('Audit log entry not found', 404));
  res.status(200).json({ success: true, data: entry });
});

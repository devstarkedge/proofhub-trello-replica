import asyncHandler from '../../middleware/asyncHandler.js';
import { queryAuditLog } from '../permissions/auditLogService.js';

export const getAuditLog = asyncHandler(async (req, res) => {
  const { cursor, limit, sort, startDate, endDate, targetId, actorId, action, search } = req.query;
  const result = await queryAuditLog({
    workspaceId: req.workspaceId, category: 'leave_management',
    cursor, limit: limit ? Number(limit) : undefined, sort, startDate, endDate, targetId, actorId, action, search
  });
  res.json({ success: true, data: result.data, nextCursor: result.nextCursor, hasMore: result.hasMore });
});

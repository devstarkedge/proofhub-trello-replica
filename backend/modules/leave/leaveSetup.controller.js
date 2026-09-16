import asyncHandler from '../../middleware/asyncHandler.js';
import { setupLeaveModule } from './leaveSetup.service.js';
import { recordAuditLog } from '../permissions/auditLogService.js';

export const setup = asyncHandler(async (req, res) => {
  const result = await setupLeaveModule({ workspaceId: req.workspaceId, actorId: req.user.id });
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_MODULE_SETUP', targetType: 'Workspace', targetId: req.workspaceId,
    resourceLabel: 'Leave Module Setup', summary: `${req.user.name} enabled the Leave module for this workspace`,
    before: null, after: result, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: result });
});

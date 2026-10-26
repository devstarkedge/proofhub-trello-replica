import asyncHandler from '../../middleware/asyncHandler.js';
import Workspace from '../../models/Workspace.js';
import { hasResourceAction } from '../permissions/permissionEngine.js';
import { updateModuleSettings } from '../hubspot/workspaceModules.js';
import { recordAuditLog } from '../permissions/auditLogService.js';

export const getSetupStatus = asyncHandler(async (req, res) => {
  const workspace = await Workspace.findById(req.workspaceId).select('leaveModuleEnabled').lean();
  const canInitialize = await hasResourceAction(req.user, 'leave', 'manage_policy', req.workspaceId);
  res.json({ success: true, data: { enabled: workspace?.leaveModuleEnabled === true, canInitialize } });
});

export const setup = asyncHandler(async (req, res) => {
  await updateModuleSettings(req.workspaceId, req.user.id, { leave: true });
  const result = { leaveModuleEnabled: true };
  await recordAuditLog({
    actor: req.user, action: 'LEAVE_MODULE_SETUP', targetType: 'Workspace', targetId: req.workspaceId,
    resourceLabel: 'Leave Module Setup', summary: `${req.user.name} enabled the Leave module for this workspace`,
    before: null, after: result, category: 'leave_management', meta: { workspaceId: req.workspaceId }
  });
  res.json({ success: true, data: result });
});

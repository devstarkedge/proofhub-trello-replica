import Workspace from '../../models/Workspace.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { clearAuthCache } from '../../middleware/authMiddleware.js';
import { recordSuperAdminAuditLog } from './superAdminAuditService.js';
import { emitSuperAdminWorkspaceStatusChanged } from '../../realtime/emitters.js';

const VALID_STATUSES = ['active', 'suspended', 'archived'];

const ACTION_FOR_TRANSITION = (fromStatus, toStatus) => {
  if (toStatus === 'suspended') return 'SUPER_ADMIN_WORKSPACE_SUSPENDED';
  if (toStatus === 'archived') return 'SUPER_ADMIN_WORKSPACE_ARCHIVED';
  // toStatus === 'active' — the semantic action name depends on where it
  // came from (spec distinguishes Reactivate from Restore).
  if (fromStatus === 'archived') return 'SUPER_ADMIN_WORKSPACE_RESTORED';
  return 'SUPER_ADMIN_WORKSPACE_REACTIVATED';
};

/**
 * Suspend / reactivate / archive / restore — one function, four transitions,
 * so validation and side effects (audit log, cache invalidation, realtime
 * event) can't drift between four near-duplicate code paths.
 *
 * Non-destructive by construction: only the four Workspace status fields are
 * written. Memberships, projects, and every other workspace-owned record are
 * left completely untouched — a suspended/archived workspace's data is
 * preserved, not deleted, matching the existing deactivateWorkspace's own
 * "soft" precedent.
 */
export async function changeWorkspaceStatus({ workspaceId, newStatus, reason, actor, meta = {} }) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new ErrorResponse(`Invalid status "${newStatus}" — must be one of ${VALID_STATUSES.join(', ')}`, 400);
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    throw new ErrorResponse('Workspace not found', 404);
  }

  const fromStatus = workspace.status;
  if (fromStatus === newStatus) {
    throw new ErrorResponse(`Workspace is already ${newStatus}`, 400);
  }

  if ((newStatus === 'suspended' || newStatus === 'archived') && !String(reason || '').trim()) {
    throw new ErrorResponse('A reason is required to suspend or archive a workspace', 400);
  }

  const before = { status: workspace.status, isActive: workspace.isActive };

  workspace.status = newStatus;
  workspace.statusReason = String(reason || '').trim() || null;
  workspace.statusChangedAt = new Date();
  workspace.statusChangedBy = actor.id;
  await workspace.save();

  // Blunt but immediate — a member active in the last 60s must not keep
  // passing protect()'s membership check for up to a minute after a
  // suspend. Super Admin status changes are rare, so clearing the whole
  // cache (rather than a targeted per-workspace invalidation this codebase
  // doesn't otherwise support) is an acceptable cost.
  clearAuthCache();

  const action = ACTION_FOR_TRANSITION(fromStatus, newStatus);
  await recordSuperAdminAuditLog({
    actor,
    workspace: workspace._id,
    workspaceName: workspace.name,
    action,
    targetType: 'Workspace',
    targetId: workspace._id,
    targetName: workspace.name,
    reason: workspace.statusReason || '',
    resourceKey: 'workspace_status',
    resourceLabel: workspace.name,
    summary: `${actor.name || actor.email} changed workspace "${workspace.name}" status from ${fromStatus} to ${newStatus}`,
    changeDetails: [
      { label: 'Status', previous: fromStatus, next: newStatus }
    ],
    before,
    after: { status: workspace.status, isActive: workspace.isActive },
    meta
  });

  const payload = {
    workspaceId: String(workspace._id),
    name: workspace.name,
    status: workspace.status,
    isActive: workspace.isActive,
    statusReason: workspace.statusReason,
    statusChangedAt: workspace.statusChangedAt,
    action
  };
  emitSuperAdminWorkspaceStatusChanged(payload);

  return workspace;
}

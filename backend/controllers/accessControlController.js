import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import User from '../models/User.js';
import { RESOURCES } from '../config/permissionRegistry.js';
import {
  resolveEffectivePermissions,
  getEffectivePermissionsForUser,
  setResourceOverride,
  clearResourceOverride
} from '../modules/permissions/accessControlService.js';
import { queryAuditLog, getAuditLogDetail } from '../modules/permissions/auditLogService.js';
import { isActiveWorkspaceMember } from '../modules/workspaces/membershipSyncService.js';

// @desc    Get the permission registry (resources + actions) for UI rendering
// @route   GET /api/access-control/registry
// @access  Private
export const getRegistry = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { resources: RESOURCES }
  });
});

// @desc    Get the current user's fully-resolved effective permissions
// @route   GET /api/access-control/my-permissions
// @access  Private
export const getMyEffectivePermissions = asyncHandler(async (req, res) => {
  const effective = await resolveEffectivePermissions(req.user);
  res.status(200).json({ success: true, data: effective });
});

// @desc    Get another user's fully-resolved effective permissions
// @route   GET /api/access-control/users/:userId/effective
// @access  Private (requires access_control.manage)
export const getUserEffectivePermissions = asyncHandler(async (req, res, next) => {
  // No separate isActiveWorkspaceMember check here — getEffectivePermissionsForUser
  // (accessControlService.js) resolves the target's WorkspaceMembership itself
  // (needed anyway, to overlay their workspace-specific role — see Fix 4) and
  // returns null for a non-member, which this 404 already covers. Checking
  // twice would just be a redundant query.
  const effective = await getEffectivePermissionsForUser(req.params.userId, req.workspaceId);
  if (!effective) {
    return next(new ErrorResponse('User not found', 404));
  }
  res.status(200).json({ success: true, data: effective });
});

// @desc    Grant/deny a resource override for a user (Sales, Finance, or any
//          future module — one endpoint, filtered by :resource)
// @route   PUT /api/access-control/users/:userId/overrides/:resource
// @access  Private (requires access_control.manage)
export const putUserResourceOverride = asyncHandler(async (req, res, next) => {
  const { userId, resource } = req.params;
  const { actions, effect, scope, scopedResourceIds, expiresAt, reason } = req.body;

  if (!RESOURCES[String(resource).toLowerCase()]) {
    return next(new ErrorResponse(`Unknown permission resource: ${resource}`, 400));
  }

  const targetUser = await User.findById(userId).select('_id');
  if (!targetUser) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(userId, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

  try {
    const result = await setResourceOverride(
      userId,
      resource,
      { actions, effect, scope, scopedResourceIds, expiresAt, reason },
      req.user,
      { ip: req.ip, userAgent: req.headers['user-agent'], workspaceId: req.workspaceId }
    );
    res.status(200).json({ success: true, message: 'Permissions updated successfully', data: result });
  } catch (error) {
    return next(new ErrorResponse(error.message, error.statusCode || 400));
  }
});

// @desc    Cursor-paginated, filterable activity log for the centralized
//          Access & Permissions module. Never uses skip/offset — `cursor`
//          is the last-seen entry's _id, so page 10,000 costs the same as
//          page 1 at any collection size.
// @route   GET /api/access-control/audit-log
// @access  Private (requires access_control.manage)
export const getAuditLog = asyncHandler(async (req, res) => {
  const { cursor, limit, sort, startDate, endDate, targetId, actorId, resourceKey, action, search } = req.query;
  const result = await queryAuditLog({
    workspaceId: req.workspaceId,
    cursor,
    limit: limit ? Number(limit) : undefined,
    sort,
    startDate,
    endDate,
    targetId,
    actorId,
    resourceKey,
    action,
    search
  });
  res.status(200).json({ success: true, ...result });
});

// @desc    Full change details for one activity log entry — fetched only
//          when a row is expanded, never as part of the list.
// @route   GET /api/access-control/audit-log/:id
// @access  Private (requires access_control.manage)
export const getAuditLogEntryDetail = asyncHandler(async (req, res, next) => {
  const entry = await getAuditLogDetail(req.params.id, req.workspaceId);
  if (!entry) {
    return next(new ErrorResponse('Activity log entry not found', 404));
  }
  res.status(200).json({ success: true, data: entry });
});

// @desc    Clear a user's override for a resource, reverting to role default
// @route   DELETE /api/access-control/users/:userId/overrides/:resource
// @access  Private (requires access_control.manage)
export const deleteUserResourceOverride = asyncHandler(async (req, res, next) => {
  const { userId, resource } = req.params;

  if (!RESOURCES[String(resource).toLowerCase()]) {
    return next(new ErrorResponse(`Unknown permission resource: ${resource}`, 400));
  }

  const targetUser = await User.findById(userId).select('_id');
  if (!targetUser) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!(await isActiveWorkspaceMember(userId, req.workspaceId))) {
    return next(new ErrorResponse('User is not a member of this workspace', 403));
  }

  try {
    const result = await clearResourceOverride(userId, resource, req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      workspaceId: req.workspaceId
    });
    res.status(200).json({ success: true, message: 'Override cleared', data: result });
  } catch (error) {
    return next(new ErrorResponse(error.message, error.statusCode || 400));
  }
});

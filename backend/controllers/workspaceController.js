import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { uploadWorkspaceIconToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';

const ICON_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
const ICON_MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — a logo, not a photo

// @desc    List the current user's workspaces, for the switcher
// @route   GET /api/workspaces
// @access  Private
export const getMyWorkspaces = asyncHandler(async (req, res) => {
  const memberships = await WorkspaceMembership.find({ user: req.user.id, status: 'active' })
    .populate('workspace', 'name slug isActive icon')
    .lean();

  const workspaces = memberships
    .filter((m) => m.workspace && m.workspace.isActive)
    .map((m) => ({
      _id: m.workspace._id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      icon: m.workspace.icon || null,
      isActive: String(m.workspace._id) === String(req.workspaceId)
    }));

  res.status(200).json({ success: true, data: workspaces });
});

// @desc    Create a new workspace — the creator becomes its admin
// @route   POST /api/workspaces
// @access  Private
export const createWorkspace = asyncHandler(async (req, res, next) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return next(new ErrorResponse('Workspace name is required', 400));
  }

  const slug = String(name).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    || `workspace-${Date.now()}`;

  // A brand-new workspace has no "active workspace" yet — this is exactly
  // the deliberate, explicit bypass case workspaceContext.runUnscoped()
  // exists for.
  const { workspace, adminRole } = await workspaceContext.runUnscoped(async () => {
    let uniqueSlug = slug;
    let suffix = 1;
    while (await Workspace.findOne({ slug: uniqueSlug })) {
      uniqueSlug = `${slug}-${suffix}`;
      suffix += 1;
    }

    const createdWorkspace = await Workspace.create({
      name: String(name).trim(),
      slug: uniqueSlug,
      owner: req.user.id
    });

    // Every workspace shares the same global 'admin' system-role template
    // (workspaceId: null, isSystem: true) — see Role.js.
    const adminRoleDoc = await Role.findResolvable('admin', null);

    return { workspace: createdWorkspace, adminRole: adminRoleDoc };
  });

  await WorkspaceMembership.create({
    workspace: workspace._id,
    user: req.user.id,
    role: 'admin',
    roleId: adminRole?._id,
    department: [],
    accessType: 'full_department',
    allowedProjects: [],
    status: 'active',
    invitedBy: req.user.id
  });

  await User.updateOne({ _id: req.user.id }, { $set: { lastActiveWorkspace: workspace._id } });
  invalidateAuthCache(req.user.id);

  res.status(201).json({
    success: true,
    data: { _id: workspace._id, name: workspace.name, slug: workspace.slug, role: 'admin', icon: null }
  });
});

// @desc    Get one workspace's details
// @route   GET /api/workspaces/:id
// @access  Private (must be a member)
export const getWorkspace = asyncHandler(async (req, res, next) => {
  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).populate('workspace', 'name slug isActive settings owner icon').lean();

  if (!membership || !membership.workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  res.status(200).json({
    success: true,
    data: { ...membership.workspace, role: membership.role }
  });
});

// @desc    Rename/update workspace settings
// @route   PATCH /api/workspaces/:id
// @access  Private (workspace admin only)
export const updateWorkspace = asyncHandler(async (req, res, next) => {
  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();

  if (!membership || membership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can update workspace settings', 403));
  }

  const updates = {};
  if (typeof req.body.name === 'string' && req.body.name.trim()) {
    updates.name = req.body.name.trim();
  }
  if (Object.keys(updates).length === 0) {
    return next(new ErrorResponse('No valid fields to update', 400));
  }

  const workspace = await workspaceContext.runUnscoped(async () => (
    await Workspace.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true })
  ));
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  res.status(200).json({ success: true, data: workspace });
});

// Notifies every currently-connected member of a workspace of an icon
// change — scoped to the workspace's own membership list (not emitToAll)
// since nobody outside it has any reason to know.
const emitWorkspaceIconUpdated = async (workspaceId, icon) => {
  try {
    const { emitToUser } = await import('../realtime/index.js');
    const memberIds = await WorkspaceMembership.find({ workspace: workspaceId, status: 'active' }).distinct('user');
    for (const userId of memberIds) {
      emitToUser(userId.toString(), 'workspace-icon-updated', { workspaceId: workspaceId.toString(), icon });
    }
  } catch (err) {
    console.error('Failed to emit workspace-icon-updated:', err);
  }
};

// @desc    Upload/replace this workspace's icon
// @route   POST /api/workspaces/:id/icon
// @access  Private (workspace admin only)
export const uploadWorkspaceIcon = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload a file', 400));
  }

  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!membership || membership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can change the workspace icon', 403));
  }

  const file = req.file;
  if (!ICON_ALLOWED_TYPES.includes(file.mimetype)) {
    return next(new ErrorResponse(
      `Invalid file type: ${file.mimetype}. Allowed types: PNG, JPG, JPEG, WEBP, SVG`, 400
    ));
  }
  if (file.size > ICON_MAX_FILE_SIZE) {
    return next(new ErrorResponse(
      `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum: 2MB`, 400
    ));
  }

  const workspace = await workspaceContext.runUnscoped(async () => await Workspace.findById(req.params.id));
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  const oldPublicId = workspace.icon?.publicId || null;

  const result = await uploadWorkspaceIconToCloudinary(file.buffer, {
    workspaceId: req.params.id,
    originalName: file.originalname,
    mimetype: file.mimetype
  });

  workspace.icon = {
    url: result.url,
    publicId: result.public_id,
    format: result.format,
    isSvg: result.isSvg,
    smallUrl: result.small_url,
    mediumUrl: result.medium_url,
    largeUrl: result.large_url,
    uploadedAt: new Date(),
    uploadedBy: req.user.id
  };
  await workspace.save();

  if (oldPublicId) {
    deleteFromCloudinary(oldPublicId, 'image').catch((err) => {
      console.error('Failed to delete old workspace icon:', err);
    });
  }

  await emitWorkspaceIconUpdated(workspace._id, workspace.icon);

  res.status(200).json({ success: true, data: { icon: workspace.icon } });
});

// @desc    Remove this workspace's icon (revert to the default app icon)
// @route   DELETE /api/workspaces/:id/icon
// @access  Private (workspace admin only)
export const removeWorkspaceIcon = asyncHandler(async (req, res, next) => {
  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!membership || membership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can change the workspace icon', 403));
  }

  const workspace = await workspaceContext.runUnscoped(async () => await Workspace.findById(req.params.id));
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  const oldPublicId = workspace.icon?.publicId || null;
  workspace.icon = undefined;
  await workspace.save();

  if (oldPublicId) {
    deleteFromCloudinary(oldPublicId, 'image').catch((err) => {
      console.error('Failed to delete workspace icon:', err);
    });
  }

  await emitWorkspaceIconUpdated(workspace._id, null);

  res.status(200).json({ success: true, data: { icon: null } });
});

// @desc    List a workspace's members
// @route   GET /api/workspaces/:id/members
// @access  Private (must be an active member)
export const getWorkspaceMembers = asyncHandler(async (req, res, next) => {
  const callerMembership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!callerMembership) {
    return next(new ErrorResponse('You are not a member of this workspace', 403));
  }

  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id).lean());
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  const members = await WorkspaceMembership.find({ workspace: req.params.id, status: 'active' })
    .populate('user', 'name email avatar')
    .sort({ joinedAt: 1 })
    .lean();

  const data = members
    .filter((m) => m.user)
    .map((m) => ({
      _id: m._id,
      user: { _id: m.user._id, name: m.user.name, email: m.user.email, avatar: m.user.avatar },
      role: m.role,
      isOwner: String(workspace.owner) === String(m.user._id),
      joinedAt: m.joinedAt
    }));

  res.status(200).json({ success: true, data, meta: { owner: workspace.owner, isActive: workspace.isActive } });
});

// @desc    List platform users not yet in this workspace, for the "add member" picker
// @route   GET /api/workspaces/:id/available-users?search=
// @access  Private (workspace admin only)
export const getAvailableWorkspaceUsers = asyncHandler(async (req, res, next) => {
  const callerMembership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!callerMembership || callerMembership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can view invitable users', 403));
  }

  const existingMemberIds = await WorkspaceMembership.find({ workspace: req.params.id }).distinct('user');

  const query = { _id: { $nin: existingMemberIds }, isActive: true };
  const { search } = req.query;
  if (search && String(search).trim()) {
    const term = String(search).trim();
    query.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } }
    ];
  }

  const users = await User.find(query).select('name email avatar').sort('name').limit(25);

  res.status(200).json({ success: true, data: users });
});

// @desc    Add an existing platform user to this workspace
// @route   POST /api/workspaces/:id/members
// @access  Private (workspace admin only)
export const addWorkspaceMember = asyncHandler(async (req, res, next) => {
  const { userId, role } = req.body;
  if (!userId || !role) {
    return next(new ErrorResponse('userId and role are required', 400));
  }

  const callerMembership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!callerMembership || callerMembership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can add members', 403));
  }

  const targetUser = await User.findById(userId).select('_id isActive').lean();
  if (!targetUser || !targetUser.isActive) {
    return next(new ErrorResponse('User not found', 404));
  }

  const existing = await WorkspaceMembership.findOne({ workspace: req.params.id, user: userId }).lean();
  if (existing) {
    return next(new ErrorResponse('User is already a member of this workspace', 400));
  }

  // Role is a plugin-scoped model — resolve it explicitly against the
  // workspace being managed rather than the caller's ambient active
  // workspace (req.workspaceId), which may differ if they're managing a
  // workspace they haven't switched into.
  const roleDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    await Role.findResolvable(String(role).toLowerCase(), req.params.id)
  ));
  if (!roleDoc) {
    return next(new ErrorResponse('Invalid role', 400));
  }

  const membership = await WorkspaceMembership.create({
    workspace: req.params.id,
    user: userId,
    role: roleDoc.slug,
    roleId: roleDoc._id,
    department: [],
    accessType: 'full_department',
    allowedProjects: [],
    status: 'active',
    invitedBy: req.user.id
  });

  const populated = await WorkspaceMembership.findById(membership._id).populate('user', 'name email avatar').lean();

  res.status(201).json({
    success: true,
    data: {
      _id: populated._id,
      user: populated.user,
      role: populated.role,
      isOwner: false,
      joinedAt: populated.joinedAt
    }
  });
});

// @desc    Change a member's role within this workspace
// @route   PATCH /api/workspaces/:id/members/:userId
// @access  Private (workspace admin only)
export const updateWorkspaceMemberRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  if (!role) {
    return next(new ErrorResponse('role is required', 400));
  }

  const callerMembership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!callerMembership || callerMembership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can change member roles', 403));
  }

  const target = await WorkspaceMembership.findOne({ workspace: req.params.id, user: req.params.userId });
  if (!target) {
    return next(new ErrorResponse('Member not found', 404));
  }

  // Never leave the workspace with zero admins.
  if (target.role === 'admin' && String(role).toLowerCase() !== 'admin') {
    const otherAdmins = await WorkspaceMembership.countDocuments({
      workspace: req.params.id, role: 'admin', status: 'active', user: { $ne: req.params.userId }
    });
    if (otherAdmins === 0) {
      return next(new ErrorResponse('This workspace must have at least one admin', 400));
    }
  }

  const roleDoc = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    await Role.findResolvable(String(role).toLowerCase(), req.params.id)
  ));
  if (!roleDoc) {
    return next(new ErrorResponse('Invalid role', 400));
  }

  target.role = roleDoc.slug;
  target.roleId = roleDoc._id;
  await target.save();

  invalidateAuthCache(req.params.userId);

  res.status(200).json({ success: true, data: { _id: target._id, role: target.role } });
});

// @desc    Remove a member from the workspace
// @route   DELETE /api/workspaces/:id/members/:userId
// @access  Private (workspace admin only)
export const removeWorkspaceMember = asyncHandler(async (req, res, next) => {
  const callerMembership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!callerMembership || callerMembership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can remove members', 403));
  }

  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id).lean());
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }
  if (String(workspace.owner) === String(req.params.userId)) {
    return next(new ErrorResponse('The workspace owner cannot be removed — transfer ownership first', 400));
  }

  const target = await WorkspaceMembership.findOne({ workspace: req.params.id, user: req.params.userId });
  if (!target) {
    return next(new ErrorResponse('Member not found', 404));
  }

  if (target.role === 'admin') {
    const otherAdmins = await WorkspaceMembership.countDocuments({
      workspace: req.params.id, role: 'admin', status: 'active', user: { $ne: req.params.userId }
    });
    if (otherAdmins === 0) {
      return next(new ErrorResponse('Cannot remove the last admin of this workspace', 400));
    }
  }

  await target.deleteOne();
  invalidateAuthCache(req.params.userId);

  // If the removed user's active workspace pointed here, fall back to
  // another membership they hold so their next request doesn't 403.
  const removedUser = await User.findById(req.params.userId).select('lastActiveWorkspace').lean();
  if (removedUser && String(removedUser.lastActiveWorkspace) === String(req.params.id)) {
    const fallback = await WorkspaceMembership.findOne({ user: req.params.userId, status: 'active' }).lean();
    await User.updateOne({ _id: req.params.userId }, { $set: { lastActiveWorkspace: fallback?.workspace || null } });
  }

  res.status(200).json({ success: true, data: { removed: true } });
});

// @desc    Leave a workspace (self-service)
// @route   POST /api/workspaces/:id/leave
// @access  Private (must be a member)
export const leaveWorkspace = asyncHandler(async (req, res, next) => {
  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id).lean());
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }
  if (String(workspace.owner) === String(req.user.id)) {
    return next(new ErrorResponse('The workspace owner cannot leave — transfer ownership or deactivate the workspace instead', 400));
  }

  const membership = await WorkspaceMembership.findOne({ workspace: req.params.id, user: req.user.id });
  if (!membership) {
    return next(new ErrorResponse('You are not a member of this workspace', 404));
  }

  // The select-workspace page and every protected API call assume at least
  // one active workspace membership — leaving your only one is a dead end
  // (no "create workspace" fallback reachable from there), so block it the
  // same way deactivateWorkspace blocks the owner-equivalent case.
  const otherMemberships = await WorkspaceMembership.countDocuments({
    user: req.user.id, status: 'active', workspace: { $ne: req.params.id }
  });
  if (otherMemberships === 0) {
    return next(new ErrorResponse('You cannot leave your only workspace', 400));
  }

  if (membership.role === 'admin') {
    const otherAdmins = await WorkspaceMembership.countDocuments({
      workspace: req.params.id, role: 'admin', status: 'active', user: { $ne: req.user.id }
    });
    if (otherAdmins === 0) {
      return next(new ErrorResponse('You are the last admin — promote another member to admin before leaving', 400));
    }
  }

  await membership.deleteOne();
  invalidateAuthCache(req.user.id);

  const user = await User.findById(req.user.id).select('lastActiveWorkspace').lean();
  if (user && String(user.lastActiveWorkspace) === String(req.params.id)) {
    const fallback = await WorkspaceMembership.findOne({ user: req.user.id, status: 'active' }).lean();
    await User.updateOne({ _id: req.user.id }, { $set: { lastActiveWorkspace: fallback?.workspace || null } });
  }

  res.status(200).json({ success: true, data: { left: true } });
});

// @desc    Transfer workspace ownership to another active admin member
// @route   PATCH /api/workspaces/:id/owner
// @access  Private (current owner only)
export const transferWorkspaceOwnership = asyncHandler(async (req, res, next) => {
  const { newOwnerId } = req.body;
  if (!newOwnerId) {
    return next(new ErrorResponse('newOwnerId is required', 400));
  }

  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id));
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }
  if (String(workspace.owner) !== String(req.user.id)) {
    return next(new ErrorResponse('Only the current owner can transfer ownership', 403));
  }
  if (String(newOwnerId) === String(req.user.id)) {
    return next(new ErrorResponse('You already own this workspace', 400));
  }

  const targetMembership = await WorkspaceMembership.findOne({ workspace: req.params.id, user: newOwnerId, status: 'active' });
  if (!targetMembership) {
    return next(new ErrorResponse('The new owner must already be an active member of this workspace', 400));
  }

  // Ownership implies admin — promote the new owner if they weren't already.
  if (targetMembership.role !== 'admin') {
    const adminRole = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
      await Role.findResolvable('admin', req.params.id)
    ));
    targetMembership.role = 'admin';
    targetMembership.roleId = adminRole?._id;
    await targetMembership.save();
    invalidateAuthCache(newOwnerId);
  }

  workspace.owner = newOwnerId;
  await workspace.save();

  res.status(200).json({ success: true, data: { _id: workspace._id, owner: workspace.owner } });
});

// @desc    Deactivate a workspace (soft delete — membership/data rows are
//          left intact; getMyWorkspaces already filters isActive so it just
//          disappears from every member's switcher)
// @route   DELETE /api/workspaces/:id
// @access  Private (owner only)
export const deactivateWorkspace = asyncHandler(async (req, res, next) => {
  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id));
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }
  if (String(workspace.owner) !== String(req.user.id)) {
    return next(new ErrorResponse('Only the workspace owner can deactivate it', 403));
  }

  const otherMemberships = await WorkspaceMembership.countDocuments({
    user: req.user.id, status: 'active', workspace: { $ne: req.params.id }
  });
  if (otherMemberships === 0) {
    return next(new ErrorResponse('You cannot deactivate your only workspace', 400));
  }

  workspace.isActive = false;
  await workspace.save();

  // Anyone whose active workspace pointed here needs a safe fallback so
  // their next request resolves to a workspace they can actually still use.
  const affected = await User.find({ lastActiveWorkspace: req.params.id }).select('_id').lean();
  for (const u of affected) {
    const fallback = await WorkspaceMembership.findOne({
      user: u._id, status: 'active', workspace: { $ne: req.params.id }
    }).lean();
    await User.updateOne({ _id: u._id }, { $set: { lastActiveWorkspace: fallback?.workspace || null } });
    invalidateAuthCache(u._id);
  }

  res.status(200).json({ success: true, data: { deactivated: true } });
});

// @desc    Switch the caller's active workspace
// @route   POST /api/workspaces/:id/switch
// @access  Private (must be a member)
export const switchWorkspace = asyncHandler(async (req, res, next) => {
  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).populate('workspace', 'name slug icon').lean();

  if (!membership || !membership.workspace) {
    return next(new ErrorResponse('You are not a member of this workspace', 403));
  }

  await User.updateOne({ _id: req.user.id }, { $set: { lastActiveWorkspace: req.params.id } });
  // Busts both the base-user cache and the membership cache so the very
  // next request — which will carry the new x-workspace-id header — never
  // races against a stale cached snapshot.
  invalidateAuthCache(req.user.id);

  res.status(200).json({
    success: true,
    data: {
      workspace: membership.workspace,
      membership: {
        role: membership.role,
        roleId: membership.roleId,
        department: membership.department,
        team: membership.team,
        accessType: membership.accessType,
        allowedProjects: membership.allowedProjects
      }
    }
  });
});

import mongoose from 'mongoose';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import Workspace from '../models/Workspace.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import Department from '../models/Department.js';
import Board from '../models/Board.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { uploadWorkspaceIconToCloudinary, deleteFromCloudinary } from '../utils/cloudinary.js';
import { createDepartmentCore } from '../modules/workspaces/departmentCreation.js';
import { createOrRestoreMembership, notifyMembershipAdded } from '../modules/workspaces/membershipCreation.js';
import { createOrRefreshInvitation } from '../modules/workspaces/invitationService.js';
import { slugify, isReservedSlug, isValidSlugFormat } from '../utils/slug.js';
import { WORKSPACE_TYPE_RULES, isValidWorkspaceType, isValidIndustry, isValidCompanySize } from '../utils/workspaceOptions.js';
import { sendWorkspaceInviteEmail } from '../utils/email.js';

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

// @desc    Create a new workspace — the creator becomes its admin. The
//          workspace, its admin membership, and its first department are
//          created as one atomic transaction: every workspace type requires
//          at least one department (Board.department is a hard schema
//          requirement — a project can never exist without one), so a
//          partially-created workspace with zero departments must be
//          structurally impossible, not just discouraged.
// @route   POST /api/workspaces
// @access  Private
export const createWorkspace = asyncHandler(async (req, res, next) => {
  const { name, type, industry, companySize } = req.body;
  const departmentName = req.body.department?.name;

  if (!name || !String(name).trim()) {
    return next(new ErrorResponse('Workspace name is required', 400));
  }
  if (!isValidWorkspaceType(type)) {
    return next(new ErrorResponse('A valid workspace type is required', 400));
  }

  const rules = WORKSPACE_TYPE_RULES[type];

  if (rules.requiresIndustry && !isValidIndustry(industry)) {
    return next(new ErrorResponse('Industry is required for this workspace type', 400));
  }
  if (rules.requiresCompanySize && !isValidCompanySize(companySize)) {
    return next(new ErrorResponse('Company size is required for this workspace type', 400));
  }
  if (rules.requiresDepartment && !String(departmentName || '').trim()) {
    return next(new ErrorResponse('At least one department is required for this workspace type', 400));
  }
  const finalDepartmentName = rules.autoDepartmentName || String(departmentName).trim();

  const slugSource = (req.body.slug && String(req.body.slug).trim()) || name;
  const normalizedSlug = slugify(slugSource);
  if (!isValidSlugFormat(normalizedSlug)) {
    return next(new ErrorResponse('Workspace URL must be at least 3 characters, using only lowercase letters, numbers, and hyphens', 400));
  }
  if (isReservedSlug(normalizedSlug)) {
    return next(new ErrorResponse('This workspace URL is reserved — please choose another', 400));
  }

  const session = await mongoose.startSession();
  let workspace;
  let department;

  try {
    await session.withTransaction(async () => {
      // A brand-new workspace has no "active workspace" yet — this is
      // exactly the deliberate, explicit bypass case
      // workspaceContext.runUnscoped() exists for. Re-checks slug
      // uniqueness inside the transaction (closing the TOCTOU race against
      // the live-availability endpoint) before writing anything.
      await workspaceContext.runUnscoped(async () => {
        const slugTaken = await Workspace.findOne({ slug: normalizedSlug }).session(session);
        if (slugTaken) {
          throw new ErrorResponse('This workspace URL is already taken', 409);
        }

        const [createdWorkspace] = await Workspace.create([{
          name: String(name).trim(),
          slug: normalizedSlug,
          owner: req.user.id,
          type,
          industry: industry && isValidIndustry(industry) ? industry : null,
          companySize: companySize && isValidCompanySize(companySize) ? companySize : null
        }], { session });
        workspace = createdWorkspace;

        // Every workspace shares the same global 'admin' system-role
        // template (workspaceId: null, isSystem: true) — see Role.js.
        const adminRole = await Role.findResolvable('admin', null);

        await WorkspaceMembership.create([{
          workspace: workspace._id,
          user: req.user.id,
          role: 'admin',
          roleId: adminRole?._id,
          department: [],
          accessType: 'full_department',
          allowedProjects: [],
          status: 'active',
          invitedBy: req.user.id
        }], { session });
      });

      // Department is a workspace-scoped model (workspaceScopePlugin) — its
      // pre('validate') hook stamps workspaceId from the active ALS
      // context, so this write must run inside a context pointed at the
      // workspace just created above, not whatever workspace (if any) the
      // caller was already active in.
      await workspaceContext.run({ workspaceId: workspace._id }, async () => {
        department = await createDepartmentCore({
          name: finalDepartmentName,
          description: '',
          managers: [],
          workspaceId: workspace._id,
          session
        });
      });

      await User.updateOne(
        { _id: req.user.id },
        { $set: { lastActiveWorkspace: workspace._id } },
        { session }
      );
    });
  } catch (err) {
    return next(err);
  } finally {
    await session.endSession();
  }

  // Only after commit — an aborted transaction must never bust the cache
  // into pointing at a workspace that doesn't exist.
  invalidateAuthCache(req.user.id);

  res.status(201).json({
    success: true,
    data: {
      _id: workspace._id,
      name: workspace.name,
      slug: workspace.slug,
      type: workspace.type,
      industry: workspace.industry,
      companySize: workspace.companySize,
      role: 'admin',
      icon: null,
      department: { _id: department._id, name: department.name }
    }
  });
});

// @desc    Check whether a workspace URL/slug is available, live (as the
//          user types). Server-normalized regardless of what the client
//          sends — the frontend's own copy of slugify() is a UX nicety
//          only, never the authority.
// @route   GET /api/workspaces/check-slug?slug=
// @access  Private
export const checkWorkspaceSlug = asyncHandler(async (req, res) => {
  const normalizedSlug = slugify(req.query.slug);

  if (!isValidSlugFormat(normalizedSlug)) {
    return res.status(200).json({ success: true, data: { normalizedSlug, available: false, reason: 'too_short' } });
  }
  if (isReservedSlug(normalizedSlug)) {
    return res.status(200).json({ success: true, data: { normalizedSlug, available: false, reason: 'reserved' } });
  }

  const taken = await workspaceContext.runUnscoped(async () => Workspace.exists({ slug: normalizedSlug }));

  res.status(200).json({
    success: true,
    data: { normalizedSlug, available: !taken, reason: taken ? 'taken' : null }
  });
});

// @desc    Invite people to this workspace by email. Emails matching an
//          existing platform user are added (or restored, if they were
//          previously removed) immediately; unknown emails get a real,
//          token-based WorkspaceInvitation (7-day expiry) emailed as an
//          /invite/:token link — they automatically join this workspace the
//          moment they register or sign in with a matching email.
// @route   POST /api/workspaces/:id/invite
// @access  Private (workspace admin only)
export const inviteWorkspaceMembers = asyncHandler(async (req, res, next) => {
  const { emails } = req.body;
  if (!Array.isArray(emails) || emails.length === 0 || emails.length > 20) {
    return next(new ErrorResponse('Provide between 1 and 20 email addresses', 400));
  }

  const callerMembership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!callerMembership || callerMembership.role !== 'admin') {
    return next(new ErrorResponse('Only a workspace admin can invite members', 403));
  }

  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id).lean());
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  const employeeRole = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    await Role.findResolvable('employee', req.params.id)
  ));

  const results = [];
  const seen = new Set();

  for (const rawEmail of emails) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) {
      results.push({ email, status: 'failed', reason: 'Duplicate email in this request' });
      continue;
    }
    seen.add(email);

    try {
      const existingUser = await User.findOne({ email }).select('_id isActive').lean();

      if (existingUser) {
        const { outcome } = await createOrRestoreMembership({
          workspaceId: req.params.id,
          userId: existingUser._id,
          role: employeeRole?.slug || 'employee',
          roleId: employeeRole?._id,
          invitedBy: req.user.id
        });
        if (outcome === 'already_member') {
          results.push({ email, status: 'already_member' });
          continue;
        }
        notifyMembershipAdded(existingUser._id, req.params.id).catch((err) => (
          console.error('Failed to emit membership-added event:', err)
        ));
        results.push({ email, status: 'added' });
      } else {
        // Re-inviting an email that already has a pending invite refreshes
        // that same row (new token/expiry) instead of creating a second
        // one — a resend, not a duplicate.
        const { plaintextToken } = await createOrRefreshInvitation({
          workspaceId: req.params.id,
          email,
          role: employeeRole?.slug || 'employee',
          roleId: employeeRole?._id,
          invitedBy: req.user.id
        });
        await sendWorkspaceInviteEmail(email, {
          workspaceName: workspace.name,
          inviterName: req.user.name,
          token: plaintextToken
        });
        results.push({ email, status: 'invited' });
      }
    } catch (err) {
      console.error(`Failed to process workspace invite for ${email}:`, err.message);
      results.push({ email, status: 'failed', reason: 'Could not process this invite' });
    }
  }

  res.status(200).json({ success: true, data: results });
});

// @desc    This workspace's setup/onboarding completeness, computed live
//          from real collection counts (no persisted onboarding-state blob
//          to drift out of sync) — powers both the post-creation checklist
//          and the "this existing workspace needs a department" banner.
// @route   GET /api/workspaces/:id/setup-status
// @access  Private (any active member)
export const getWorkspaceSetupStatus = asyncHandler(async (req, res, next) => {
  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: 'active'
  }).lean();
  if (!membership) {
    return next(new ErrorResponse('You are not a member of this workspace', 403));
  }

  const workspace = await workspaceContext.runUnscoped(async () => Workspace.findById(req.params.id).lean());
  if (!workspace) {
    return next(new ErrorResponse('Workspace not found', 404));
  }

  const [departmentCount, memberCount, projectCount] = await workspaceContext.run(
    { workspaceId: req.params.id },
    async () => Promise.all([
      Department.countDocuments({}),
      WorkspaceMembership.countDocuments({ workspace: req.params.id, status: 'active' }),
      Board.countDocuments({})
    ])
  );

  const hasIcon = !!workspace.icon?.url;
  const type = workspace.type || 'team';

  const checklist = [
    { key: 'department', label: 'Create your first department', completed: departmentCount > 0 },
    { key: 'project', label: 'Create your first project', completed: projectCount > 0 },
    ...(type !== 'personal' ? [
      { key: 'invite', label: 'Invite your team', completed: memberCount > 1 },
      { key: 'branding', label: 'Add a workspace logo', completed: hasIcon }
    ] : [])
  ];

  const completionPercent = Math.round(
    (checklist.filter((item) => item.completed).length / checklist.length) * 100
  );

  res.status(200).json({
    success: true,
    data: { needsSetup: departmentCount === 0, checklist, completionPercent }
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

  // department/isVerified/isActive are additionally populated here (beyond
  // what the member list itself needed originally) so HR Panel — the sole
  // place for workspace member management — can source its whole Users
  // Directory (role, department, pending/active status) from this one
  // workspace-scoped endpoint instead of the global, unscoped GET /api/users.
  //
  // .populate('department', ...) issues its own Department.find() under the
  // hood, which IS subject to workspaceScopePlugin — must run inside a
  // context pinned to req.params.id specifically. The ambient per-request
  // context (from `protect`) is the *caller's own* active workspace, which
  // usually matches but isn't guaranteed to (an admin viewing a workspace
  // other than their currently-active one).
  const members = await workspaceContext.run({ workspaceId: req.params.id }, async () => (
    WorkspaceMembership.find({ workspace: req.params.id, status: 'active' })
      .populate('user', 'name email avatar isVerified isActive')
      .populate('department', 'name')
      .sort({ joinedAt: 1 })
      .lean()
  ));

  const data = members
    .filter((m) => m.user)
    .map((m) => ({
      _id: m._id,
      user: {
        _id: m.user._id,
        name: m.user.name,
        email: m.user.email,
        avatar: m.user.avatar,
        isVerified: m.user.isVerified,
        isActive: m.user.isActive
      },
      role: m.role,
      department: (m.department || []).map((d) => ({ _id: d._id, name: d.name })),
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

  // Excludes only current (active/suspended) members — a 'removed' row must
  // NOT exclude the user here, or they'd become permanently unable to be
  // re-added through this picker (addWorkspaceMember restores that row
  // rather than erroring on it — see below).
  const existingMemberIds = await WorkspaceMembership.find({
    workspace: req.params.id,
    status: { $ne: 'removed' }
  }).distinct('user');

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

  const { outcome, membership } = await createOrRestoreMembership({
    workspaceId: req.params.id,
    userId,
    role: roleDoc.slug,
    roleId: roleDoc._id,
    invitedBy: req.user.id
  });
  if (outcome === 'already_member') {
    return next(new ErrorResponse('This user is already a member of this workspace.', 400));
  }

  notifyMembershipAdded(userId, req.params.id).catch((err) => (
    console.error('Failed to emit membership-added event:', err)
  ));

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

  // Excludes 'removed' — a removed membership isn't a current member, so
  // this correctly 404s instead of silently editing a ghost row.
  const target = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.params.userId,
    status: { $ne: 'removed' }
  });
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

  // Excludes 'removed' — removing an already-removed member cleanly 404s
  // instead of silently no-op-ing.
  const target = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.params.userId,
    status: { $ne: 'removed' }
  });
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

  // Soft delete — keeps the row (joinedAt, prior role, invitedBy) so a
  // later re-invite/re-add restores it instead of colliding with the
  // unique {workspace,user} index. The user's global account and their
  // membership in every other workspace are completely untouched.
  target.status = 'removed';
  await target.save();
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

  const membership = await WorkspaceMembership.findOne({
    workspace: req.params.id,
    user: req.user.id,
    status: { $ne: 'removed' }
  });
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

  // Soft delete, matching removeWorkspaceMember — a later re-invite restores
  // this row instead of colliding with the unique {workspace,user} index.
  membership.status = 'removed';
  await membership.save();
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

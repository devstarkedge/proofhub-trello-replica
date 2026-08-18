import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Department from '../models/Department.js';
import Team from '../models/Team.js';
import Notification from '../models/Notification.js';
import Role from '../models/Role.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { sendEmail, sendPasswordResetEmail } from '../utils/email.js';
import notificationService from '../utils/notificationService.js';
import { chatHooks } from '../utils/chatHooks.js';
import config from '../config/index.js';
import {
  runBackground,
  sendEmailInBackground,
  createNotificationInBackground
} from '../utils/backgroundTasks.js';
import { ensureDefaultWorkspace } from '../modules/permissions/workspaceService.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';
import { syncMembershipFromUser } from '../modules/workspaces/membershipSyncService.js';
import { findValidInvitationByToken, acceptInvitation } from '../modules/workspaces/invitationService.js';
import { createDepartmentCore } from '../modules/workspaces/departmentCreation.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { slugify, isReservedSlug, isValidSlugFormat } from '../utils/slug.js';
import { isValidWorkspaceType, WORKSPACE_TYPE_RULES, isValidIndustry, isValidCompanySize } from '../utils/workspaceOptions.js';
import { createDefaultSubscription } from '../modules/superAdmin/subscriptionService.js';
import { isSuperAdminEmailAllowed } from '../middleware/requireSuperAdmin.js';
import { recordSuperAdminAuditLog } from '../modules/superAdmin/superAdminAuditService.js';

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @desc    Register user. Requires a valid `inviteToken` — public
//          self-registration is not supported (enterprise B2B pattern:
//          accounts only ever come from accepting a workspace invitation,
//          or from /api/auth/register-workspace when starting a brand-new
//          workspace). An invited registration joins the specific workspace
//          that invited this exact email, and skips the admin-verification
//          gate (the invite itself is the approval — see invitationService.js).
// @route   POST /api/auth/register
// @access  Public (invite-token only)
export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, department, inviteToken } = req.body;

  if (!inviteToken) {
    return next(new ErrorResponse(
      'Public self-registration is not available. You need an invitation to join a workspace, or you can create a new workspace instead.',
      400
    ));
  }

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return next(new ErrorResponse('Email already exists. Please use a different email address.', 400));
  }

  let invitation = null;
  if (inviteToken) {
    invitation = await findValidInvitationByToken(inviteToken);
    if (!invitation) {
      return next(new ErrorResponse('This invitation is invalid or has expired', 400));
    }
    if (invitation.email.toLowerCase() !== String(email || '').toLowerCase()) {
      return next(new ErrorResponse('This invitation was sent to a different email address', 400));
    }
  }

  // Public registration happens before any workspace is selected — every
  // self-registered user joins the single default workspace (consistent
  // with the "Login Flow: Single Workspace" case). An invite-token
  // registration joins the invited workspace instead, and only that one.
  const targetWorkspaceId = invitation ? invitation.workspace : await ensureDefaultWorkspace();
  if (!targetWorkspaceId) {
    return next(new ErrorResponse('No workspace available to register into', 500));
  }

  const { user, employeeRole } = await workspaceContext.run({ workspaceId: targetWorkspaceId }, async () => {
    // Validate department if provided
    if (department) {
      const deptExists = await Department.findById(department);
      if (!deptExists) {
        throw new ErrorResponse('Invalid department selected', 400);
      }
    }

    // Determine roleId for default 'employee' role — the global system
    // template (workspaceId: null), never a workspace-custom role.
    const role = await Role.findOne({ slug: 'employee', workspaceId: null });

    const createdUser = await User.create({
      name,
      email,
      password,
      role: 'employee',
      roleId: role?._id,
      department: department || undefined,
      isVerified: !!invitation // invited signups are pre-approved; public ones still need an admin to verify
    });

    return { user: createdUser, employeeRole: role };
  });

  let acceptOutcome = 'joined';
  if (invitation) {
    const result = await acceptInvitation(invitation._id, user._id);
    acceptOutcome = result.outcome === 'pending_approval' ? 'pending_approval' : 'joined';
  } else {
    await syncMembershipFromUser(user._id, targetWorkspaceId);
  }

  // Pending-approval: no membership exists yet for targetWorkspaceId — must
  // NOT set it as lastActiveWorkspace, or protect (authMiddleware.js) would
  // find no active membership on this user's very next request and 403 them
  // before they can even see their own (empty) workspace list.
  if (acceptOutcome !== 'pending_approval') {
    await User.updateOne({ _id: user._id }, { $set: { lastActiveWorkspace: targetWorkspaceId } });
  }

  // Get department name for notification
  let departmentName = 'No department selected';
  if (department) {
    const dept = await workspaceContext.run({ workspaceId: targetWorkspaceId }, async () => await Department.findById(department));
    departmentName = dept ? dept.name : 'Unknown department';
  }

  // Generate token
  const token = generateToken(user._id);
  res.status(201).json({
    success: true,
    token,
    outcome: acceptOutcome, // 'joined' | 'pending_approval' — see invitationService.js#acceptInvitation
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      isVerified: user.isVerified
    }
  });

  // Run non-blocking background tasks: notify admins and send welcome email
  runBackground(() => workspaceContext.run({ workspaceId: targetWorkspaceId }, async () => {
    try {
      // Nothing pending to verify for an invite-based signup — skip the
      // "please review this new user" ping to admins/managers.
      if (!invitation) {
        const authorizedUsers = await User.find({
          role: { $in: ['admin', 'manager'] },
          isActive: true
        }).select('_id');
        const authorizedIds = authorizedUsers.map(u => u._id);
        await notificationService.notifyUserRegistered(user, authorizedIds);
      }

      // Dispatch chat webhook for user registration
      chatHooks.onUserRegistered(user).catch(console.error);

      // Compute department name inside background task to avoid blocking response
      let deptName = 'No department selected';
      if (department) {
        const dept = await Department.findById(department);
        deptName = dept ? dept.name : 'Unknown department';
      }

      // Send welcome email
      await sendEmail({
        to: email,
        subject: 'Welcome to Project Management',
        html: `
          <h1>Welcome ${name}!</h1>
          <p>Your account has been created successfully.</p>
          <p><strong>Department:</strong> ${deptName}</p>
          ${invitation ? '' : '<p>An administrator will verify your account shortly.</p>'}
        `
      });
    } catch (error) {
      console.error('Post-registration background failed:', error);
    }
  }));
});

// @desc    Register a new user AND create their first workspace in one atomic flow.
//          The workspace owner is auto-verified (no admin gate — the invite itself
//          is the approval, matching the spec: "Owner Account -> Status = Active").
//          Returns a JWT so the client can immediately redirect to the dashboard.
// @route   POST /api/auth/register-workspace
// @access  Public
export const registerAndCreateWorkspace = asyncHandler(async (req, res, next) => {
  const {
    name,        // owner's full name
    email,       // owner's email
    password,    // owner's password
    workspaceName,
    workspaceSlug,  // optional — auto-generated from workspaceName if absent
    workspaceType,  // 'company' | 'team'
    industry,       // required for 'company'
    companySize,    // required for 'company'
    departmentName, // required for 'company' and 'team'
  } = req.body;

  // Basic field validation
  if (!name || !email || !password || !workspaceName || !workspaceType) {
    return next(new ErrorResponse('Name, email, password, workspace name, and workspace type are required', 400));
  }

  if (!isValidWorkspaceType(workspaceType)) {
    return next(new ErrorResponse('A valid workspace type is required', 400));
  }

  const rules = WORKSPACE_TYPE_RULES[workspaceType];
  if (rules.requiresIndustry && !isValidIndustry(industry)) {
    return next(new ErrorResponse('Industry is required for this workspace type', 400));
  }
  if (rules.requiresCompanySize && !isValidCompanySize(companySize)) {
    return next(new ErrorResponse('Company size is required for this workspace type', 400));
  }
  const finalDeptName = rules.autoDepartmentName || String(departmentName || '').trim() || 'General';

  // Check if user already exists
  const userExists = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (userExists) {
    return next(new ErrorResponse('An account with this email already exists. Please sign in instead.', 400));
  }

  const slugSource = (workspaceSlug && String(workspaceSlug).trim()) || workspaceName;
  const normalizedSlug = slugify(slugSource);
  if (!isValidSlugFormat(normalizedSlug)) {
    return next(new ErrorResponse('Workspace URL must be at least 3 characters, using only lowercase letters, numbers, and hyphens', 400));
  }
  if (isReservedSlug(normalizedSlug)) {
    return next(new ErrorResponse('This workspace URL is reserved — please choose another', 400));
  }

  const session = await mongoose.startSession();
  let createdUser, workspace, department;

  try {
    await session.withTransaction(async () => {
      await workspaceContext.runUnscoped(async () => {
        // Slug uniqueness check inside transaction (closes TOCTOU race)
        const slugTaken = await Workspace.findOne({ slug: normalizedSlug }).session(session);
        if (slugTaken) throw new ErrorResponse('This workspace URL is already taken', 409);

        const adminRole = await Role.findResolvable('admin', null);

        // 1. Create the owner user — auto-verified (workspace owner needs no admin approval)
        const [newUser] = await User.create([{
          name: String(name).trim(),
          email: String(email).toLowerCase().trim(),
          password,
          role: 'admin',
          roleId: adminRole?._id,
          isVerified: true,  // Workspace founders are self-verified
        }], { session });
        createdUser = newUser;

        // 2. Create the workspace
        const [newWorkspace] = await Workspace.create([{
          name: String(workspaceName).trim(),
          slug: normalizedSlug,
          owner: newUser._id,
          type: workspaceType,
          industry: industry && isValidIndustry(industry) ? industry : null,
          companySize: companySize && isValidCompanySize(companySize) ? companySize : null,
        }], { session });
        workspace = newWorkspace;

        // 3. Create owner membership (admin, active immediately)
        await WorkspaceMembership.create([{
          workspace: workspace._id,
          user: newUser._id,
          role: 'admin',
          roleId: adminRole?._id,
          department: [],
          accessType: 'full_department',
          allowedProjects: [],
          status: 'active',
          invitedBy: newUser._id,
        }], { session });

        // 4. Update user's lastActiveWorkspace
        await User.updateOne({ _id: newUser._id }, { $set: { lastActiveWorkspace: workspace._id } }, { session });
      });

      // 5. Create the first department INSIDE the same transaction — every
      // workspace must have at least one department (Board.department is a
      // hard schema requirement elsewhere in this app), so this can never
      // be allowed to run after commit: a failure here must roll back the
      // user/workspace/membership too, not leave them orphaned with zero
      // departments. Department is workspace-scoped (workspaceScopePlugin),
      // so this write needs an active context pinned to the workspace just
      // created above.
      await workspaceContext.run({ workspaceId: workspace._id }, async () => {
        department = await createDepartmentCore({
          name: finalDeptName,
          description: '',
          managers: [],
          workspaceId: workspace._id,
          session
        });
      });
    });
  } catch (err) {
    return next(err);
  } finally {
    await session.endSession();
  }

  // Persist active workspace on user
  await User.updateOne({ _id: createdUser._id }, { $set: { lastActiveWorkspace: workspace._id } });
  // Client will persist workspaceId to localStorage after receiving the response

  // Best-effort, non-blocking — see workspaceController.createWorkspace's
  // identical call for why this must never fail registration itself.
  createDefaultSubscription(workspace._id).catch((err) => {
    console.error('Failed to create default subscription for new workspace:', { workspaceId: workspace._id, error: err.message });
  });

  const token = generateToken(createdUser._id);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: createdUser._id,
      name: createdUser.name,
      email: createdUser.email,
      role: 'admin',
      isVerified: true,
    },
    workspace: {
      _id: workspace._id,
      name: workspace.name,
      slug: workspace.slug,
      role: 'admin',
    },
  });

  // Background: send welcome email
  runBackground(async () => {
    try {
      await sendEmail({
        to: createdUser.email,
        subject: `Welcome to ${workspace.name} on FlowTask!`,
        html: `
          <h1>Welcome ${createdUser.name}!</h1>
          <p>Your workspace <strong>${workspace.name}</strong> has been created successfully.</p>
          <p>You can now invite your team members and start managing your projects.</p>
        `
      });
    } catch (e) {
      console.error('Welcome email failed:', e);
    }
  });
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email and password
  if (!email || !password) {
    return next(new ErrorResponse('Please provide email and password', 400));
  }

  // Check for user (include password field)
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return next(new ErrorResponse('No account found with this email address. Please check your email or register for a new account.', 401));
  }

  // Check if user is active
  if (!user.isActive) {
    return next(new ErrorResponse('Account has been deactivated', 401));
  }

  // Check if password matches
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Update last login
  user.lastLogin = Date.now();
  await user.save();

  // Generate token
  const token = generateToken(user._id);

  // Effective, not raw: both the DB role AND the current SUPER_ADMIN_EMAILS
  // allowlist must hold (see requireSuperAdmin.js) — returning the raw DB
  // flag here would let the frontend redirect/gate someone into the
  // /super-admin shell whose every API call then 403s, since the backend
  // enforces both checks. This is the one value the frontend ever reads.
  const isSuperAdminEffective = user.isSuperAdmin === true && isSuperAdminEmailAllowed(user.email);

  if (isSuperAdminEffective) {
    recordSuperAdminAuditLog({
      actor: user,
      action: 'SUPER_ADMIN_LOGIN',
      targetType: 'User',
      targetId: user._id,
      targetName: user.name,
      targetEmail: user.email,
      summary: `${user.name || user.email} logged in as Super Admin`,
      meta: { ip: req.ip, userAgent: req.headers['user-agent'] }
    }).catch(() => {}); // never let audit logging affect the login response
  }

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      department: user.department,
      team: user.team,
      avatar: user.avatar,
      isVerified: user.isVerified,
      forcePasswordChange: user.forcePasswordChange,
      // Platform-level, not workspace-scoped — see models/User.js. Included
      // here (not just in getMe/verify) so a freshly-granted Super Admin's
      // very next login already reflects it without a second round-trip.
      isSuperAdmin: isSuperAdminEffective
    }
  });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res, next) => {
  const baseUser = await User.findById(req.user.id).select('-password').lean();

  // req.user's role/department/team/accessType/allowedProjects are already
  // the correct values for the *active* workspace (overlaid by `protect`
  // from WorkspaceMembership) — re-populating from the raw User document
  // here would silently show the default-workspace mirror instead once a
  // user has switched workspaces, so populate department/team names from
  // the overlay's ids, not the base document's.
  //
  // Department is workspace-scoped (workspaceScopePlugin) — querying it
  // requires an active context. req.workspaceId is null for the one
  // legitimate no-workspace case, a Super Admin account with no usable
  // workspace (see authMiddleware.js's protect — it deliberately doesn't
  // open a context for that request at all, so a workspace-scoped query
  // here would throw). There's nothing to fetch in that case anyway
  // (req.user.department is already [] for it), so skip straight to empty
  // instead of querying.
  const [departments, team, workspaces] = req.workspaceId
    ? await Promise.all([
        Department.find({ _id: { $in: req.user.department || [] } }).select('name').lean(),
        req.user.team ? Team.findById(req.user.team).select('name').lean() : null,
        WorkspaceMembership.find({ user: req.user.id, status: 'active' })
          .populate('workspace', 'name slug')
          .lean()
      ])
    : [[], null, await WorkspaceMembership.find({ user: req.user.id, status: 'active' }).populate('workspace', 'name slug').lean()];

  const user = {
    ...baseUser,
    role: req.user.role,
    roleId: req.user.roleId,
    department: departments,
    team,
    accessType: req.user.accessType,
    allowedProjects: req.user.allowedProjects,
    // Override the raw DB flag from ...baseUser with the effective value —
    // see the identical computation/comment in login() above.
    isSuperAdmin: baseUser?.isSuperAdmin === true && isSuperAdminEmailAllowed(baseUser.email)
  };

  res.status(200).json({
    success: true,
    data: user,
    workspaces: workspaces
      .filter((m) => m.workspace)
      .map((m) => ({ _id: m.workspace._id, name: m.workspace.name, slug: m.workspace.slug, role: m.role })),
    activeWorkspaceId: req.workspaceId
  });
});

// @desc    Update user details
// @route   PUT /api/auth/updatedetails
// @access  Private
export const updateDetails = asyncHandler(async (req, res, next) => {
  const fieldsToUpdate = {
    name: req.body.name,
    email: req.body.email,
    avatar: req.body.avatar
  };

  const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update password
// @route   PUT /api/auth/updatepassword
// @access  Private
export const updatePassword = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  if (!(await user.comparePassword(req.body.currentPassword))) {
    return next(new ErrorResponse('Password is incorrect', 401));
  }

  user.password = req.body.newPassword;
  await user.save();

  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token
  });
});

// adminCreateUser (POST /api/auth/admin-create-user) was retired — superseded
// by the centralized Invite Member system's Method A
// (memberInvitationController.js#inviteMember, method:'direct'), which does
// the same thing permission-gated (not hardcoded admin-only) and workspace-
// aware. TeamManagement.jsx's "Invite Member" button now opens that instead.

// @desc    Check email uniqueness
// @route   POST /api/auth/check-email
// @access  Public
export const checkEmail = asyncHandler(async (req, res, next) => {
  const { email, excludeUserId } = req.body;

  if (!email) {
    return next(new ErrorResponse('Email is required', 400));
  }

  // Search for a user with the provided email
  const existing = await User.findOne({ email }).select('_id');

  // If found and it's not the excluded user, it's not available
  const available = !(existing && (!excludeUserId || existing._id.toString() !== excludeUserId));

  res.status(200).json({ success: true, available });
});

// @desc    Refresh JWT token
// @route   POST /api/auth/refresh
// @access  Private
export const refreshToken = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Generate new token
  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token
  });
});

// @desc    Forgot password — send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  // Step 1: Find user by email
  const user = await User.findOne({ email });

  if (!user) {
    return next(new ErrorResponse('No account found with this email address.', 404));
  }

  if (!user.isActive) {
    return next(new ErrorResponse('This account has been deactivated. Please contact support.', 403));
  }

  // Step 2: Check verification status
  if (!user.isVerified) {
    return next(new ErrorResponse('Please verify your account before resetting your password. Contact your administrator for verification.', 403));
  }

  // Step 3: Generate reset token (plaintext for URL, hashed for DB storage)
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  // Step 4: Store hashed token and expiry
  user.resetPasswordToken = hashedToken;
  user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  await user.save({ validateBeforeSave: false });

  // Step 5: Build reset URL and send email in background
  const resetUrl = `${config.frontendUrl}/reset-password/${resetToken}`;

  runBackground(async () => {
    try {
      await sendPasswordResetEmail(user, resetUrl);
    } catch (error) {
      console.error('Password reset email failed:', error.message);
      // Clear token if email fails so user can retry immediately
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
    }
  });

  res.status(200).json({
    success: true,
    message: 'Password reset link has been sent to your email address.'
  });
});

// @desc    Verify reset token validity
// @route   GET /api/auth/verify-reset-token/:token
// @access  Public
export const verifyResetToken = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }

  res.status(200).json({ success: true, valid: true });
});

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = asyncHandler(async (req, res, next) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired reset token. Please request a new password reset.', 400));
  }

  // Set new password (triggers bcrypt pre-save hook)
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  user.lastLogin = Date.now();
  await user.save();

  // Generate fresh JWT for auto-login
  const token = generateToken(user._id);

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleId: user.roleId,
      department: user.department,
      team: user.team,
      avatar: user.avatar,
      isVerified: user.isVerified,
      forcePasswordChange: false
    }
  });
});

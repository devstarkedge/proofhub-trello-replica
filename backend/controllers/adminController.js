import WorkspaceMembership from '../models/WorkspaceMembership.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { requestEmailChange } from '../services/emailChangeService.js';
import { issueSession } from '../services/authSessionService.js';
/**
 * @desc    Update the signed-in admin's account settings
 * @route   PUT /api/admin/settings
 * @access  Private/Admin
 */
export const updateAdminSettings = asyncHandler(async (req, res, next) => {
  const { newEmail, currentPassword, newPassword } = req.body;

  // Only admin can update admin settings
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admin can update admin settings', 403));
  }

  const admin = await User.findById(req.user.id).select('+password');

  // Verify current password if changing password
  if (newPassword) {
    if (!currentPassword) {
      return next(new ErrorResponse('Current password is required to change password', 400));
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return next(new ErrorResponse('Current password is incorrect', 401));
    }

    if (newPassword === currentPassword) {
      return next(new ErrorResponse('New password cannot be the same as the current password', 400));
    }
  }

  // Update email if provided
  if (newEmail && newEmail !== admin.email) {
    await requestEmailChange(req.user.id, newEmail);
  }

  // Update password if provided
  if (newPassword) {
    admin.password = newPassword;
    admin.forcePasswordChange = false; // Remove force password change flag
  }

  await admin.save();

  res.status(200).json({
    success: true,
    ...(newPassword ? await issueSession(admin) : {}),
    message: newEmail && newEmail !== admin.email ? 'Check your new email address to confirm the change.' : 'Account settings updated successfully',
    data: {
      email: admin.email,
      forcePasswordChange: admin.forcePasswordChange
    }
  });
});

/**
 * @desc    Get system statistics
 * @route   GET /api/admin/stats
 * @access  Private/Admin
 */
export const getSystemStats = asyncHandler(async (req, res, next) => {
  const memberships = await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' }).select('user role').lean();
  const ids = memberships.map(m => m.user);
  const [verifiedUsers, activeUsers] = await Promise.all([User.countDocuments({ _id: { $in: ids }, isVerified: true }), User.countDocuments({ _id: { $in: ids }, isActive: true })]);
  const counts = new Map();
  memberships.forEach(m => counts.set(m.role, (counts.get(m.role) || 0) + 1));
  res.json({ success: true, data: { totalUsers: ids.length, verifiedUsers, activeUsers, usersByRole: [...counts].map(([_id, count]) => ({ _id, count })) } });
});

/**
 * @desc    Force password change for user
 * @route   PUT /api/admin/force-password-change/:id
 * @access  Private/Admin
 */
export const forcePasswordChange = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  user.forcePasswordChange = true;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User will be forced to change password on next login'
  });
});

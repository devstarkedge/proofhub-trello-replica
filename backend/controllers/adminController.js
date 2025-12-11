import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @desc    Update admin settings (email/password and .env)
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
    // Check if new email is already taken
    const emailExists = await User.findOne({ email: newEmail });
    if (emailExists) {
      return next(new ErrorResponse('Email already in use', 400));
    }
    admin.email = newEmail;
  }

  // Update password if provided
  if (newPassword) {
    admin.password = newPassword;
    admin.forcePasswordChange = false; // Remove force password change flag
  }

  await admin.save();

  // Update .env file
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';

  try {
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    // Update ADMIN_EMAIL if email changed
    if (newEmail) {
      if (envContent.includes('ADMIN_EMAIL=')) {
        envContent = envContent.replace(/ADMIN_EMAIL=.*/, `ADMIN_EMAIL=${newEmail}`);
      } else {
        envContent += `\nADMIN_EMAIL=${newEmail}`;
      }
    }

    // Update ADMIN_PASSWORD if password changed
    if (newPassword) {
      if (envContent.includes('ADMIN_PASSWORD=')) {
        envContent = envContent.replace(/ADMIN_PASSWORD=.*/, `ADMIN_PASSWORD=${newPassword}`);
      } else {
        envContent += `\nADMIN_PASSWORD=${newPassword}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim());
  } catch (error) {
    console.error('Error updating .env file:', error);
    // Don't fail the request if .env update fails
  }

  res.status(200).json({
    success: true,
    message: 'Admin settings updated successfully',
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
  const totalUsers = await User.countDocuments();
  const verifiedUsers = await User.countDocuments({ isVerified: true });
  const activeUsers = await User.countDocuments({ isActive: true });

  const usersByRole = await User.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      verifiedUsers,
      activeUsers,
      usersByRole
    }
  });
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
  await user.save();

  res.status(200).json({
    success: true,
    message: 'User will be forced to change password on next login'
  });
});

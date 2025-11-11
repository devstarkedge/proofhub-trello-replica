import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
export const getUsers = asyncHandler(async (req, res, next) => {
  const { department, team, role, search } = req.query;

  let query = {};

  if (department) query.department = department;
  if (team) query.team = team;
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  const users = await User.find(query)
    .populate('department', 'name')
    .populate('team', 'name')
    .select('-password')
    .sort('name');

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate('department', 'name')
    .populate('team', 'name')
    .select('-password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
export const updateUser = asyncHandler(async (req, res, next) => {
  const { name, email, role, department, team, isVerified, isActive } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Update fields
  if (name) user.name = name;
  if (email) user.email = email;
  if (role && req.user.role === 'admin') user.role = role;
  if (department !== undefined) user.department = department;
  if (team !== undefined) user.team = team;
  if (isVerified !== undefined && req.user.role === 'admin') user.isVerified = isVerified;
  if (isActive !== undefined && req.user.role === 'admin') user.isActive = isActive;

  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
export const getProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('department', 'name')
    .populate('team', 'name')
    .select('-password');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Verify user (Admin only)
// @route   PUT /api/users/:id/verify
// @access  Private/Admin
export const verifyUser = asyncHandler(async (req, res, next) => {
  const { role, department } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Update verification status and role/department if provided
  user.isVerified = true;
  if (role) user.role = role;
  if (department !== undefined) user.department = department; // Allow null to remove department

  await user.save();

  // Invalidate cache for user-related endpoints
  const { invalidateCache } = await import('../middleware/cache.js');
  invalidateCache('/api/users'); // Invalidate all user list caches
  invalidateCache('/api/auth/me'); // Invalidate user profile cache

  // Emit real-time update via socket to all connected admin users
  const { emitToUser } = await import('../server.js');
  emitToUser(user._id.toString(), 'user-verified', {
    userId: user._id,
    isVerified: true,
    role: user.role,
    department: user.department
  });

  // Also emit to admin users who might be viewing the HR panel
  // This ensures all admin users see the update immediately
  const { emitToTeam } = await import('../server.js');
  emitToTeam('admin', 'user-verified', {
    userId: user._id,
    isVerified: true,
    role: user.role,
    department: user.department
  });

  // Send verification email
  try {
    const { sendEmail } = await import('../utils/email.js');
    await sendEmail({
      to: user.email,
      subject: 'Account Verified',
      html: `
        <h1>Account Verified!</h1>
        <p>Your account has been verified by an administrator.</p>
        <p>You can now access all features.</p>
      `
    });
  } catch (error) {
    console.error('Email sending failed:', error);
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Decline user registration (Admin only)
// @route   DELETE /api/users/:id/decline
// @access  Private/Admin
export const declineUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Only allow declining unverified users
  if (user.isVerified) {
    return next(new ErrorResponse('Cannot decline a verified user', 400));
  }

  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: 'User registration declined and data deleted successfully'
  });
});

// @desc    Assign Employee to department/team
// @route   PUT /api/users/:id/assign
// @access  Private/Admin
export const assignUser = asyncHandler(async (req, res, next) => {
  const { departments, team } = req.body; // Changed to departments (plural)

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (departments !== undefined) {
    user.department = departments; // Assign the array of department IDs

    // Add user to appropriate department array based on role
    if (departments && departments.length > 0) {
      const Department = (await import('../models/Department.js')).default;
      for (const deptId of departments) {
        const dept = await Department.findById(deptId);
        if (dept) {
          // Determine which array to add user to based on role
          const isManagerRole = user.role === 'admin' || user.role === 'manager';
          const targetArray = isManagerRole ? 'managers' : 'members';
          const oppositeArray = isManagerRole ? 'members' : 'managers';

          // Remove from opposite array if present
          if (dept[oppositeArray].includes(req.params.id)) {
            dept[oppositeArray] = dept[oppositeArray].filter(id => id.toString() !== req.params.id);
          }

          // Add to target array if not already present
          if (!dept[targetArray].includes(req.params.id)) {
            dept[targetArray].push(req.params.id);
          }

          await dept.save();
        }
      }
    }
  }
  if (team !== undefined) user.team = team;

  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

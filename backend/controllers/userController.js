import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { sendWelcomeEmail, sendVerificationEmail } from '../utils/email.js';
import notificationService from '../utils/notificationService.js';

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
  if (role && (req.user.role === 'admin' || req.user.role === 'manager')) {
    user.role = role;
    
    // Lookup roleId
    const Role = (await import('../models/Role.js')).default;
    const roleDoc = await Role.findOne({ slug: role.toLowerCase() });
    if (roleDoc) {
      user.roleId = roleDoc._id;
    } else {
      user.roleId = null;
    }
  }
  if (department !== undefined) user.department = department;
  if (team !== undefined) user.team = team;
  if (isVerified !== undefined && (req.user.role === 'admin' || req.user.role === 'manager')) user.isVerified = isVerified;
  if (isActive !== undefined && (req.user.role === 'admin' || req.user.role === 'manager')) user.isActive = isActive;

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

  // Permission check: only admins can delete users
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Only admins can delete users', 403));
  }

  // Prevent deletion of admin users
  if (user.role === 'admin') {
    return next(new ErrorResponse('Cannot delete admin users', 400));
  }

  // Import required models
  const Department = (await import('../models/Department.js')).default;
  const Team = (await import('../models/Team.js')).default;
  const Board = (await import('../models/Board.js')).default;
  const Card = (await import('../models/Card.js')).default;
  const Comment = (await import('../models/Comment.js')).default;
  const Notification = (await import('../models/Notification.js')).default;
  const Activity = (await import('../models/Activity.js')).default;

  // Remove user references from departments
  await Department.updateMany(
    { $or: [{ managers: req.params.id }, { members: req.params.id }] },
    { $pull: { managers: req.params.id, members: req.params.id } }
  );

  // Remove user references from teams
  await Team.updateMany(
    { $or: [{ owner: req.params.id }, { members: req.params.id }] },
    { $unset: { owner: null }, $pull: { members: req.params.id } }
  );

  // Remove user references from boards
  await Board.updateMany(
    { $or: [{ owner: req.params.id }, { members: req.params.id }] },
    { $unset: { owner: null }, $pull: { members: req.params.id } }
  );

  // Remove user references from cards
  await Card.updateMany(
    { assignees: req.params.id },
    { $pull: { assignees: req.params.id } }
  );

  // Delete comments by the user
  await Comment.deleteMany({ user: req.params.id });

  // Delete notifications involving the user
  await Notification.deleteMany({ $or: [{ user: req.params.id }, { sender: req.params.id }] });

  // Delete activities by the user
  await Activity.deleteMany({ user: req.params.id });

  // Finally, delete the user
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

// @desc    Update current user profile
// @route   PUT /api/users/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, email, title } = req.body;

  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Check if email is being changed and if it's already taken
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorResponse('Email already in use', 400));
    }
  }

  // Update fields
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (title !== undefined) user.title = title;

  await user.save();

  // Populate department and team for response
  await user.populate('department', 'name');
  await user.populate('team', 'name');

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Get all verified users for announcements
// @route   GET /api/users/verified
// @access  Private/Admin
export const getVerifiedUsers = asyncHandler(async (req, res, next) => {
  const users = await User.find({
    isVerified: true,
    isActive: true
  })
    .populate('department', 'name')
    .select('name email avatar department role')
    .sort('name');

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Get users by departments for announcements
// @route   GET /api/users/by-departments
// @access  Private/Admin
export const getUsersByDepartments = asyncHandler(async (req, res, next) => {
  const { departments } = req.query;

  if (!departments) {
    return next(new ErrorResponse('Departments parameter is required', 400));
  }

  const departmentIds = Array.isArray(departments) ? departments : departments.split(',');

  const users = await User.find({
    department: { $in: departmentIds },
    isVerified: true,
    isActive: true
  })
    .populate('department', 'name')
    .select('name email avatar department role')
    .sort('name');

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Get all manager users for announcements
// @route   GET /api/users/managers
// @access  Private/Admin
export const getManagerUsers = asyncHandler(async (req, res, next) => {
  const users = await User.find({
    role: { $in: ['admin', 'manager'] },
    isVerified: true,
    isActive: true
  })
    .populate('department', 'name')
    .select('name email avatar department role')
    .sort('name');

  res.status(200).json({
    success: true,
    data: users
  });
});

// @desc    Update current user settings
// @route   PUT /api/users/settings
// @access  Private
export const updateSettings = asyncHandler(async (req, res, next) => {
  const { notifications, currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // If changing password, verify current password
  if (newPassword) {
    if (!currentPassword) {
      return next(new ErrorResponse('Current password is required to change password', 400));
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return next(new ErrorResponse('Current password is incorrect', 400));
    }

    if (newPassword === currentPassword) {
      return next(new ErrorResponse('New password cannot be the same as the current password', 400));
    }

    user.password = newPassword;
  }

  // Update settings
  if (notifications !== undefined) {
    user.settings.notifications = { ...user.settings.notifications, ...notifications };
  }

  await user.save();

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(200).json({
    success: true,
    data: userResponse
  });
});

// @desc    Verify user (Admin and Manager only)
// @route   PUT /api/users/:id/verify
// @access  Private/Admin/Manager
export const verifyUser = asyncHandler(async (req, res, next) => {
  // Strict Role Check
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Not authorized to verify users', 403));
  }

  const { role, department } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Update verification status and role/department if provided
  user.isVerified = true;
  if (role) {
    user.role = role;
    
    // Lookup roleId
    const Role = (await import('../models/Role.js')).default;
    const roleDoc = await Role.findOne({ slug: role.toLowerCase() });
    if (roleDoc) {
      user.roleId = roleDoc._id;
    }
  }
  if (department !== undefined) user.department = department; // Allow null to remove department

  await user.save();

  // Invalidate cache for user-related endpoints
  const { invalidateCache } = await import('../middleware/cache.js');
  invalidateCache('/api/users'); // Invalidate all user list caches
  invalidateCache('/api/auth/me'); // Invalidate user profile cache
  invalidateCache('/api/auth/verify'); // Invalidate session verification cache
  invalidateCache('/api/notifications'); // Invalidate notifications cache for the user

  // Respond immediately for fast UI
  res.status(200).json({
    success: true,
    data: user
  });

  // Run non-blocking background tasks
  const { runBackground } = await import('../utils/backgroundTasks.js');
  
  runBackground(async () => {
    try {
      // Emit real-time update via socket to all connected admin and manager users
      const { emitToUser } = await import('../server.js');
      emitToUser(user._id.toString(), 'user-verified', {
        userId: user._id,
        isVerified: true,
        role: user.role,
        department: user.department
      });

      // Also emit to admin and manager users who might be viewing the HR panel
      const { emitToTeam } = await import('../server.js');
      
      // Emit to admins
      emitToTeam('admin', 'user-verified', {
        userId: user._id,
        isVerified: true,
        role: user.role,
        department: user.department
      });
      
      // Emit to managers
      emitToTeam('manager', 'user-verified', {
        userId: user._id,
        isVerified: true,
        role: user.role,
        department: user.department
      });

      // Send verification email
      await sendVerificationEmail(user);

      // Notify admins and managers about new user verification
      const authorizedUsers = await User.find({ 
        role: { $in: ['admin', 'manager'] }, 
        isActive: true 
      }).select('_id');
      const authorizedIds = authorizedUsers.map(u => u._id);
      await notificationService.notifyUserVerified(user, authorizedIds);
    } catch (error) {
      console.error('Background verification tasks failed:', error);
    }
  });
});

// @desc    Decline user registration (Admin and Manager only)
// @route   DELETE /api/users/:id/decline
// @access  Private/Admin/Manager
export const declineUser = asyncHandler(async (req, res, next) => {
  // Strict Role Check
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return next(new ErrorResponse('Not authorized to decline users', 403));
  }

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

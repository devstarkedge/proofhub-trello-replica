import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Department from '../models/Department.js';
import Notification from '../models/Notification.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { sendEmail } from '../utils/email.js';

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password, department } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    return next(new ErrorResponse('User already exists', 400));
  }

  // Validate department if provided
  if (department) {
    const deptExists = await Department.findById(department);
    if (!deptExists) {
      return next(new ErrorResponse('Invalid department selected', 400));
    }
  }

  // Create user (default role is 'employee' unless admin creates)
  const user = await User.create({
    name,
    email,
    password,
    role: 'employee',
    department: department || undefined,
    isVerified: false // Admin needs to verify
  });

  // Get department name for notification
  let departmentName = 'No department selected';
  if (department) {
    const dept = await Department.findById(department);
    departmentName = dept ? dept.name : 'Unknown department';
  }

  // Notify all admins about new registration
  const admins = await User.find({ role: 'admin', isActive: true });

  for (const admin of admins) {
    await Notification.create({
      type: 'user_registered',
      title: 'New User Registration',
      message: `${name} (${email}) has registered for department: ${departmentName} and needs verification`,
      user: admin._id,
      sender: user._id
    });
  }

  // Send welcome email with department info
  try {
    await sendEmail({
      to: email,
      subject: 'Welcome to Project Management',
      html: `
        <h1>Welcome ${name}!</h1>
        <p>Your account has been created successfully.</p>
        <p><strong>Department:</strong> ${departmentName}</p>
        <p>An administrator will verify your account shortly.</p>
      `
    });
  } catch (error) {
    console.error('Email sending failed:', error);
  }

  // Generate token
  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      isVerified: user.isVerified
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
    return next(new ErrorResponse('Invalid credentials', 401));
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

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      team: user.team,
      avatar: user.avatar,
      isVerified: user.isVerified,
      forcePasswordChange: user.forcePasswordChange
    }
  });
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('department', 'name')
    .populate('team', 'name');

  res.status(200).json({
    success: true,
    data: user
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

import Department from '../models/Department.js';
import User from '../models/User.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
export const getDepartments = asyncHandler(async (req, res, next) => {
  const departments = await Department.find({ isActive: true })
    .populate('manager', 'name email')
    .populate('members', 'name email')
    .populate('projects', 'name description background')
    .sort('name');

  res.status(200).json({
    success: true,
    count: departments.length,
    data: departments
  });
});

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
export const getDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id)
    .populate('manager', 'name email')
    .populate('members', 'name email');

  if (!department) {
    return next(new ErrorResponse('Department not found', 404));
  }

  res.status(200).json({
    success: true,
    data: department
  });
});

// @desc    Create department
// @route   POST /api/departments
// @access  Private/Admin
export const createDepartment = asyncHandler(async (req, res, next) => {
  const { name, description, manager } = req.body;

  // Check if department exists
  const existingDept = await Department.findOne({ name });
  if (existingDept) {
    return next(new ErrorResponse('Department already exists', 400));
  }

  const department = await Department.create({
    name,
    description,
    manager,
    members: manager ? [manager] : []
  });

  res.status(201).json({
    success: true,
    data: department
  });
});

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private/Admin
export const updateDepartment = asyncHandler(async (req, res, next) => {
  const { name, description, manager, members, isActive } = req.body;

  const department = await Department.findById(req.params.id);

  if (!department) {
    return next(new ErrorResponse('Department not found', 404));
  }

  // Update fields
  if (name) department.name = name;
  if (description !== undefined) department.description = description;
  if (manager !== undefined) department.manager = manager;
  if (members) department.members = members;
  if (isActive !== undefined) department.isActive = isActive;

  await department.save();

  // Populate manager data before returning
  await department.populate('manager', 'name email');

  res.status(200).json({
    success: true,
    data: department
  });
});

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private/Admin
export const deleteDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id);

  if (!department) {
    return next(new ErrorResponse('Department not found', 404));
  }

  // Soft delete - mark as inactive
  department.isActive = false;
  await department.save();

  // Remove department from users
  await User.updateMany(
    { department: req.params.id },
    { $unset: { department: 1 } }
  );

  res.status(200).json({
    success: true,
    message: 'Department deactivated successfully'
  });
});

// @desc    Add member to department
// @route   POST /api/departments/:id/members
// @access  Private/Admin
export const addMemberToDepartment = asyncHandler(async (req, res, next) => {
  const { userId } = req.body;

  const department = await Department.findById(req.params.id);
  const user = await User.findById(userId);

  if (!department) {
    return next(new ErrorResponse('Department not found', 404));
  }

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!department.members.includes(userId)) {
    department.members.push(userId);
    await department.save();
  }

  user.department = req.params.id;
  await user.save();

  res.status(200).json({
    success: true,
    data: department
  });
});

// @desc    Remove member from department
// @route   DELETE /api/departments/:id/members/:userId
// @access  Private/Admin
export const removeMemberFromDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id);

  if (!department) {
    return next(new ErrorResponse('Department not found', 404));
  }

  department.members = department.members.filter(id => id.toString() !== req.params.userId);
  await department.save();

  await User.findByIdAndUpdate(req.params.userId, { $unset: { department: 1 } });

  res.status(200).json({
    success: true,
    data: department
  });
});

import Department from "../models/Department.js";
import User from "../models/User.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
export const getDepartments = asyncHandler(async (req, res, next) => {
  const departments = await Department.find({ isActive: true })
    .populate("managers", "name email")
    .populate("members", "name email")
    .populate("projects", "name description background members")
    .sort("name");

  // Add projects count to each department
  const departmentsWithCount = departments.map((dept) => ({
    ...dept.toObject(),
    projectsCount: dept.projects.length,
  }));

  res.status(200).json({
    success: true,
    count: departmentsWithCount.length,
    data: departmentsWithCount,
  });
});

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
export const getDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id)
    .populate("managers", "name email")
    .populate("members", "name email");

  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  res.status(200).json({
    success: true,
    data: department,
  });
});

// @desc    Create department
// @route   POST /api/departments
// @access  Private/Admin
export const createDepartment = asyncHandler(async (req, res, next) => {
  const { name, description, managers } = req.body;

  // Check if department exists
  const existingDept = await Department.findOne({ name });
  if (existingDept) {
    return next(new ErrorResponse("Department already exists", 400));
  }

  const department = await Department.create({
    name,
    description,
    managers: managers || [],
    members: managers ? managers : [],
  });

  // Invalidate relevant caches
  invalidateCache("/api/departments");

  res.status(201).json({
    success: true,
    data: department,
  });
});

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private/Admin
export const updateDepartment = asyncHandler(async (req, res, next) => {
  const { name, description, managers, members, isActive } = req.body;

  const department = await Department.findById(req.params.id);

  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Update fields
  if (name) department.name = name;
  if (description !== undefined) department.description = description;
  if (managers !== undefined) department.managers = managers;
  if (members) department.members = members;
  if (isActive !== undefined) department.isActive = isActive;

  await department.save();

  // Populate managers data before returning
  await department.populate("managers", "name email");

  // Invalidate relevant caches
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${req.params.id}`);

  res.status(200).json({
    success: true,
    data: department,
  });
});

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private/Admin
export const deleteDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id);

  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Soft delete - mark as inactive
  department.isActive = false;
  await department.save();

  // Remove department from users
  await User.updateMany(
    { department: req.params.id },
    { $unset: { department: 1 } }
  );

  // Invalidate relevant caches
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${req.params.id}`);

  res.status(200).json({
    success: true,
    message: "Department deactivated successfully",
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
    return next(new ErrorResponse("Department not found", 404));
  }

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  // Check if user is already assigned to another department
  if (user.department && user.department.toString() !== req.params.id) {
    const currentDept = await Department.findById(user.department);
    return res.status(400).json({
      success: false,
      message: `Employee ${user.name} is already assigned to ${
        currentDept?.name || "another department"
      }.`,
    });
  }

  if (!department.members.includes(userId)) {
    department.members.push(userId);
    await department.save();
  }

  user.department = req.params.id;
  await user.save();

  // Invalidate relevant caches
  invalidateCache(`/api/departments/${req.params.id}`);

  res.status(200).json({
    success: true,
    data: department,
  });
});

// @desc    Remove member from department
// @route   DELETE /api/departments/:id/members/:userId
// @access  Private/Admin
export const removeMemberFromDepartment = asyncHandler(
  async (req, res, next) => {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return next(new ErrorResponse("Department not found", 404));
    }

    department.members = department.members.filter(
      (id) => id.toString() !== req.params.userId
    );
    await department.save();

    await User.findByIdAndUpdate(req.params.userId, {
      $unset: { department: 1 },
    });

    // Invalidate relevant caches
    invalidateCache(`/api/departments/${req.params.id}`);

    res.status(200).json({
      success: true,
      data: department,
    });
  }
);

// @desc    Unassign user from department
// @route   PUT /api/departments/:deptId/users/:userId/unassign
// @access  Private/Admin
export const unassignUserFromDepartment = asyncHandler(
  async (req, res, next) => {
    const { deptId, userId } = req.params;

    const user = await User.findById(userId);
    const department = await Department.findById(deptId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (!department) {
      return next(new ErrorResponse("Department not found", 404));
    }

    // Check if user is assigned to this department
    if (!user.department || !user.department.includes(deptId)) {
      return res.status(400).json({
        success: false,
        message: "User is not assigned to this department",
      });
    }

    // Remove department from user's department array
    user.department = user.department.filter(id => id.toString() !== deptId);
    await user.save();

    // Remove user from department's members array
    department.members = department.members.filter(
      (id) => id.toString() !== userId
    );
    await department.save();

    // Invalidate relevant caches
    invalidateCache(`/api/departments/${deptId}`);

    res.status(200).json({
      success: true,
      message: `Employee ${user.name} unassigned from ${department.name} successfully`,
    });
  }
);

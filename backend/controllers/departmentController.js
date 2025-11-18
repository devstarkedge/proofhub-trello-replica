import Department from "../models/Department.js";
import User from "../models/User.js";
import Board from "../models/Board.js";
import Card from "../models/Card.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";
import { emitUserAssigned, emitUserUnassigned } from "../utils/socketEmitter.js";

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
export const getDepartments = asyncHandler(async (req, res, next) => {
  const departments = await Department.find({ isActive: true })
    .populate("managers", "name email")
    .populate("members", "name email")
    .populate("projects", "name description background members status")
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
    members: [],
  });

  // Update managers' department field to include this department
  if (managers && managers.length > 0) {
    await User.updateMany(
      { _id: { $in: managers } },
      { $addToSet: { department: department._id } }
    );
  }

  // Invalidate relevant caches for real-time updates
  invalidateCache("/api/departments");
  invalidateCache("/api/users"); // Invalidate users cache to update manager assignments

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

  // Store old managers for cleanup
  const oldManagers = department.managers || [];

  // Update fields
  if (name) department.name = name;
  if (description !== undefined) department.description = description;
  if (managers !== undefined) department.managers = managers;
  if (members) department.members = members;
  if (isActive !== undefined) department.isActive = isActive;

  await department.save();

  // Update managers' department field
  if (managers !== undefined) {
    const newManagers = managers || [];
    const managersToAdd = newManagers.filter(id => !oldManagers.includes(id));
    const managersToRemove = oldManagers.filter(id => !newManagers.includes(id));

    // Add department to new managers
    if (managersToAdd.length > 0) {
      await User.updateMany(
        { _id: { $in: managersToAdd } },
        { $addToSet: { department: department._id } }
      );
    }

    // Remove department from old managers (only if they have no other roles in this department)
    if (managersToRemove.length > 0) {
      await User.updateMany(
        { _id: { $in: managersToRemove } },
        { $pull: { department: department._id } }
      );
    }
  }

  // Populate managers data before returning
  await department.populate("managers", "name email");

  // Invalidate relevant caches for real-time updates
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${req.params.id}`);
  invalidateCache("/api/users"); // Invalidate users cache to update manager assignments

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

  // Remove department from users (use $pull for array field)
  await User.updateMany(
    { department: req.params.id },
    { $pull: { department: req.params.id } }
  );

  // Actually delete the department from database
  await Department.findByIdAndDelete(req.params.id);

  // Invalidate relevant caches
  invalidateCache("/api/departments");
  invalidateCache(`/api/departments/${req.params.id}`);

  res.status(200).json({
    success: true,
    message: "Department deleted successfully",
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

  // Use $addToSet to avoid duplicates
  await Department.findByIdAndUpdate(req.params.id, {
    $addToSet: { members: userId }
  });

  // Update user's department field
  user.department = req.params.id;
  await user.save();

  // Invalidate relevant caches
  invalidateCache(`/api/departments/${req.params.id}`);
  invalidateCache('/api/users');

  // Emit socket event for real-time updates
  emitUserAssigned(userId, req.params.id);

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

    // Use $pull to remove from array
    await Department.findByIdAndUpdate(req.params.id, {
      $pull: { members: req.params.userId }
    });

    // Update user's department field
    await User.findByIdAndUpdate(req.params.userId, {
      $unset: { department: 1 },
    });

    // Invalidate relevant caches
    invalidateCache(`/api/departments/${req.params.id}`);
    invalidateCache('/api/users');

    // Emit socket event for real-time updates
    emitUserUnassigned(req.params.userId, req.params.id);

    res.status(200).json({
      success: true,
      data: department,
    });
  }
);

// @desc    Get members with project assignments for department
// @route   GET /api/departments/:id/members-with-assignments
// @access  Private
export const getMembersWithAssignments = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id);

  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Get all projects in this department
  const projects = await Board.find({ department: req.params.id, isArchived: false })
    .populate('members', 'name email')
    .select('_id name members');

  // Get all cards (tasks) in these projects
  const projectIds = projects.map(p => p._id);
  const cards = await Card.find({ board: { $in: projectIds } })
    .populate('assignees', 'name email')
    .populate('members', 'name email')
    .select('_id board assignees members subtasks');

  // Collect all unique members who have assignments
  const assignedMembers = new Set();

  // Add members directly assigned to projects
  if (projects && projects.length > 0) {
    projects.forEach(project => {
      if (project.members && project.members.length > 0) {
        project.members.forEach(member => {
          assignedMembers.add(member._id.toString());
        });
      }
    });
  }

  // Add members assigned to tasks/cards
  if (cards && cards.length > 0) {
    cards.forEach(card => {
      if (card.assignees && card.assignees.length > 0) {
        card.assignees.forEach(assignee => {
          assignedMembers.add(assignee._id.toString());
        });
      }
      if (card.members && card.members.length > 0) {
        card.members.forEach(member => {
          assignedMembers.add(member._id.toString());
        });
      }
    });
  }

  // Add members assigned to subtasks
  if (cards && cards.length > 0) {
    cards.forEach(card => {
      if (card.subtasks && card.subtasks.length > 0) {
        // Note: Subtasks don't have direct assignees in the schema, but we can extend this if needed
      }
    });
  }

  // Filter department members to only include those with assignments
  const membersWithAssignments = department.members.filter(memberId =>
    assignedMembers.has(memberId.toString())
  );

  // Populate the member details
  const populatedMembers = await User.find({
    _id: { $in: membersWithAssignments }
  }).select('name email');

  res.status(200).json({
    success: true,
    data: populatedMembers,
  });
});

// @desc    Get projects where a member has assignments for department
// @route   GET /api/departments/:id/projects-with-member/:memberId
// @access  Private
export const getProjectsWithMemberAssignments = asyncHandler(async (req, res, next) => {
  const { id: departmentId, memberId } = req.params;

  const department = await Department.findById(departmentId);
  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Get all projects in this department
  const allProjects = await Board.find({
    department: departmentId,
    isArchived: false
  }).select('_id name description background members status');

  // Get projects where member is directly assigned
  const directlyAssignedProjects = allProjects.filter(project =>
    project.members && project.members.some(member => member.toString() === memberId)
  );

  // Get projects where member is assigned to tasks/cards
  const projectIds = allProjects.map(p => p._id);
  const cardsWithMember = await Card.find({
    board: { $in: projectIds },
    $or: [
      { assignees: memberId },
      { members: memberId }
    ]
  }).select('board').distinct('board');

  // Combine all project IDs
  const assignedProjectIds = new Set([
    ...directlyAssignedProjects.map(p => p._id.toString()),
    ...cardsWithMember.map(id => id.toString())
  ]);

  // Get the actual projects
  const assignedProjects = allProjects.filter(project =>
    assignedProjectIds.has(project._id.toString())
  );

  res.status(200).json({
    success: true,
    data: assignedProjects,
  });
});

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
    invalidateCache('/api/users');

    // Emit socket event for real-time updates
    emitUserUnassigned(userId, deptId);

    res.status(200).json({
      success: true,
      message: `Employee ${user.name} unassigned from ${department.name} successfully`,
    });
  }
);

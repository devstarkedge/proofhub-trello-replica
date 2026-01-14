import Department from "../models/Department.js";
import User from "../models/User.js";
import Board from "../models/Board.js";
import Card from "../models/Card.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { invalidateCache } from "../middleware/cache.js";
import { emitUserAssigned, emitUserUnassigned, emitBulkUsersAssigned, emitBulkUsersUnassigned } from "../utils/socketEmitter.js";
import { runBackground, createNotificationInBackground } from '../utils/backgroundTasks.js';

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
export const getDepartments = asyncHandler(async (req, res, next) => {
  const user = req.user;

  // Build query based on user role
  let query = { isActive: true };
  
  if (user) {
    // Only Admin sees all departments
    // Non-admin users (including managers) see only departments they're assigned to
    if (user.role !== 'admin') {
      // Get departments from user's assigned department array
      const userDeptIds = Array.isArray(user.department) ? user.department : [];
      query._id = { $in: userDeptIds };
    }
  }

  const departments = await Department.find(query)
    .populate("managers", "name email avatar")
    .populate("members", "name email avatar")
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

// @desc    Get all active departments (Public for registration)
// @route   GET /api/departments/public
// @access  Public
export const getPublicDepartments = asyncHandler(async (req, res, next) => {
  const departments = await Department.find({ isActive: true })
    .select('name')
    .sort('name');

  res.status(200).json({
    success: true,
    count: departments.length,
    data: departments
  });
});

// @desc    Get all departments with member assignments (optimized for HomePage)
// @route   GET /api/departments/with-assignments
// @access  Private
// @desc    Get all departments with member assignments (optimized for HomePage)
// @route   GET /api/departments/with-assignments
// @access  Private
export const getDepartmentsWithAssignments = asyncHandler(async (req, res, next) => {
  const user = req.user;

  // Build match query based on user role (for Dashboard/Home - shows only assigned)
  let matchQuery = { isActive: true };
  
  if (user) {
    // Only Admin sees all departments
    // Non-admin users (including managers) see only departments they're assigned to
    if (user.role !== 'admin') {
      // Get departments from user's assigned department array
      const userDeptIds = Array.isArray(user.department) ? user.department : [];
      matchQuery._id = { $in: userDeptIds };
    }
    // Admin users see all departments (no additional filter)
  }

  // OPTIMIZED: Single aggregation pipeline instead of N+1 queries
  const departments = await Department.aggregate([
    { $match: matchQuery },
    // Lookup managers
    {
      $lookup: {
        from: 'users',
        localField: 'managers',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
        as: 'managers'
      }
    },
    // Lookup members
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1 } }],
        as: 'members'
      }
    },
    // Lookup projects (boards)
    {
      $lookup: {
        from: 'boards',
        let: { deptId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$department', '$$deptId'] }, isArchived: false } },
          { $project: { name: 1, description: 1, background: 1, members: 1, status: 1, coverImage: 1, coverImageHistory: 1, dueDate: 1 } }
        ],
        as: 'projects'
      }
    },
    // Lookup all cards for this department's projects (include status and isArchived for progress calculation)
    {
      $lookup: {
        from: 'cards',
        let: { projectIds: '$projects._id' },
        pipeline: [
          { $match: { $expr: { $in: ['$board', '$$projectIds'] } } },
          { $project: { board: 1, assignees: 1, members: 1, status: 1, isArchived: 1 } }
        ],
        as: 'allCards'
      }
    },
    // Add progress fields to each project
    {
      $addFields: {
        projects: {
          $map: {
            input: '$projects',
            as: 'project',
            in: {
              $let: {
                vars: {
                  projectCards: {
                    $filter: {
                      input: '$allCards',
                      as: 'card',
                      cond: {
                        $and: [
                          { $eq: ['$$card.board', '$$project._id'] },
                          { $ne: ['$$card.isArchived', true] }
                        ]
                      }
                    }
                  }
                },
                in: {
                  $mergeObjects: [
                    '$$project',
                    {
                      totalCards: { $size: '$$projectCards' },
                      completedCards: {
                        $size: {
                          $filter: {
                            input: '$$projectCards',
                            as: 'c',
                            cond: { $eq: ['$$c.status', 'done'] }
                          }
                        }
                      },
                      progress: {
                        $cond: {
                          if: { $gt: [{ $size: '$$projectCards' }, 0] },
                          then: {
                            $round: {
                              $multiply: [
                                {
                                  $divide: [
                                    {
                                      $size: {
                                        $filter: {
                                          input: '$$projectCards',
                                          as: 'c',
                                          cond: { $eq: ['$$c.status', 'done'] }
                                        }
                                      }
                                    },
                                    { $size: '$$projectCards' }
                                  ]
                                },
                                100
                              ]
                            }
                          },
                          else: 0
                        }
                      }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    },
    // Compute derived fields
    {
      $addFields: {
        projectsCount: { $size: '$projects' },
        // Collect all assigned member IDs from projects and cards
        _assignedMemberIds: {
          $setUnion: [
            // Members from projects
            { $reduce: {
              input: '$projects',
              initialValue: [],
              in: { $concatArrays: ['$$value', { $ifNull: ['$$this.members', []] }] }
            }},
            // Assignees from cards
            { $reduce: {
              input: '$allCards',
              initialValue: [],
              in: { $concatArrays: ['$$value', { $ifNull: ['$$this.assignees', []] }] }
            }},
            // Members from cards
            { $reduce: {
              input: '$allCards',
              initialValue: [],
              in: { $concatArrays: ['$$value', { $ifNull: ['$$this.members', []] }] }
            }}
          ]
        }
      }
    },
    // Filter members to only those with assignments
    {
      $addFields: {
        membersWithAssignments: {
          $filter: {
            input: '$members',
            as: 'member',
            cond: { $in: ['$$member._id', '$_assignedMemberIds'] }
          }
        }
      }
    },
    // Build projectsWithMemberAssignments mapping
    {
      $addFields: {
        projectsWithMemberAssignments: {
          $arrayToObject: {
            $map: {
              input: '$membersWithAssignments',
              as: 'member',
              in: {
                k: { $toString: '$$member._id' },
                v: {
                  $filter: {
                    input: '$projects',
                    as: 'project',
                    cond: {
                      $or: [
                        { $in: ['$$member._id', { $ifNull: ['$$project.members', []] }] },
                        { $gt: [
                          { $size: {
                            $filter: {
                              input: '$allCards',
                              as: 'card',
                              cond: {
                                $and: [
                                  { $eq: ['$$card.board', '$$project._id'] },
                                  { $or: [
                                    { $in: ['$$member._id', { $ifNull: ['$$card.assignees', []] }] },
                                    { $in: ['$$member._id', { $ifNull: ['$$card.members', []] }] }
                                  ]}
                                ]
                              }
                            }
                          }},
                          0
                        ]}
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    // Clean up internal fields
    { $project: { allCards: 0, _assignedMemberIds: 0 } },
    { $sort: { name: 1 } }
  ]);

  res.status(200).json({
    success: true,
    count: departments.length,
    data: departments,
  });
});

// Helper function to get members with assignments (extracted from getMembersWithAssignments)
async function getMembersWithAssignmentsData(departmentId) {
  const department = await Department.findById(departmentId);
  if (!department) return [];

  // Get all projects in this department
  const projects = await Board.find({ department: departmentId, isArchived: false })
    .populate('members', 'name email')
    .select('_id name members');

  // Get all cards (tasks) in these projects
  const projectIds = projects.map(p => p._id);
  const cards = await Card.find({ board: { $in: projectIds } })
    .populate('assignees', 'name email')
    .populate('members', 'name email')
    .select('_id board assignees members subtaskStats');

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

  // Filter department members to only include those with assignments
  const membersWithAssignments = department.members.filter(memberId =>
    assignedMembers.has(memberId.toString())
  );

  // Populate the member details
  const populatedMembers = await User.find({
    _id: { $in: membersWithAssignments }
  }).select('name email avatar');

  return populatedMembers;
}

// Helper function to get projects with member assignments (extracted from getProjectsWithMemberAssignments)
async function getProjectsWithMemberAssignmentsData(departmentId, memberId) {
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

  return assignedProjects;
}

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
export const getDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findById(req.params.id)
    .populate("managers", "name email avatar")
    .populate("members", "name email avatar");

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

  // Create notification and push in background (non-blocking)
  runBackground(async () => {
    try {
      await createNotificationInBackground({
        type: 'user_assigned',
        title: 'Department Assignment',
        message: `You have been assigned to the department: ${department.name}`,
        user: userId,
        sender: req.user._id
      });
    } catch (err) {
      console.error('Background assignment notification failed:', err);
    }
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
    .select('_id board assignees members subtaskStats');

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

  // Filter department members to only include those with assignments
  const membersWithAssignments = department.members.filter(memberId =>
    assignedMembers.has(memberId.toString())
  );

  // Populate the member details
  const populatedMembers = await User.find({
    _id: { $in: membersWithAssignments }
  }).select('name email avatar');

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

    // Send real-time notification to the user
    try {
      const notificationService = (await import('../utils/notificationService.js')).default;
      await notificationService.createNotification({
        type: 'user_unassigned',
        title: 'Department Assignment Updated',
        message: `You have been unassigned from the department: ${department.name}`,
        user: user._id,
        sender: req.user._id
      });
    } catch (error) {
      console.error('Unassignment notification failed:', error);
    }

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

// @desc    Bulk assign users to department
// @route   POST /api/departments/:id/bulk-assign
// @access  Private/Admin
export const bulkAssignUsersToDepartment = asyncHandler(async (req, res, next) => {
  const { userIds } = req.body;
  const departmentId = req.params.id;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorResponse("User IDs array is required", 400));
  }

  const department = await Department.findById(departmentId);
  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Get users to assign
  const users = await User.find({ _id: { $in: userIds } });
  if (users.length !== userIds.length) {
    return next(new ErrorResponse("Some users not found", 404));
  }

  const results = [];
  const errors = [];

  // Process each user assignment
  for (const user of users) {
    try {
      // Check if user is already assigned to another department
      if (user.department && user.department.length > 0 &&
          !user.department.some(dept => (typeof dept === 'string' ? dept : dept._id || dept) === departmentId)) {
        const currentDept = await Department.findById(user.department[0]);
        errors.push({
          userId: user._id,
          name: user.name,
          error: `Already assigned to ${currentDept?.name || 'another department'}`
        });
        continue;
      }

      // Add department to user's department array if not already present
      const deptArray = Array.isArray(user.department) ? user.department : [];
      const deptExists = deptArray.some(dept =>
        (typeof dept === 'string' ? dept : dept._id || dept) === departmentId
      );

      if (!deptExists) {
        user.department = [...deptArray, departmentId];
        await user.save();
      }

      // Add user to department's members array if not already present
      const memberExists = department.members.some(member =>
        (typeof member === 'string' ? member : member._id || member) === user._id.toString()
      );

      if (!memberExists) {
        department.members = [...department.members, user._id];
      }

      // Send notification
      try {
        const notificationService = (await import('../utils/notificationService.js')).default;
        await notificationService.createNotification({
          type: 'user_assigned',
          title: 'Department Assignment',
          message: `You have been assigned to the department: ${department.name}`,
          user: user._id,
          sender: req.user._id
        });
      } catch (notificationError) {
        console.error('Assignment notification failed:', notificationError);
      }

      results.push({
        userId: user._id,
        name: user.name,
        status: 'assigned'
      });

      // Emit socket event
      emitUserAssigned(user._id, departmentId);

    } catch (error) {
      console.error(`Error assigning user ${user._id}:`, error);
      errors.push({
        userId: user._id,
        name: user.name,
        error: error.message
      });
    }
  }

  // Save department changes
  await department.save();

  // Invalidate caches
  invalidateCache(`/api/departments/${departmentId}`);
  invalidateCache('/api/users');

  res.status(200).json({
    success: true,
    data: {
      assigned: results,
      errors: errors,
      totalAttempted: userIds.length,
      totalAssigned: results.length,
      totalErrors: errors.length
    }
  });
});

// @desc    Bulk unassign users from department
// @route   POST /api/departments/:id/bulk-unassign
// @access  Private/Admin
export const bulkUnassignUsersFromDepartment = asyncHandler(async (req, res, next) => {
  const { userIds } = req.body;
  const departmentId = req.params.id;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new ErrorResponse("User IDs array is required", 400));
  }

  const department = await Department.findById(departmentId);
  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  // Get users to unassign
  const users = await User.find({ _id: { $in: userIds } });
  if (users.length !== userIds.length) {
    return next(new ErrorResponse("Some users not found", 404));
  }

  const results = [];
  const errors = [];

  // Process each user unassignment
  for (const user of users) {
    try {
      // Check if user is assigned to this department
      if (!user.department || !user.department.includes(departmentId)) {
        errors.push({
          userId: user._id,
          name: user.name,
          error: 'Not assigned to this department'
        });
        continue;
      }

      // Remove department from user's department array
      user.department = user.department.filter(id => id.toString() !== departmentId);
      await user.save();

      // Remove user from department's members array
      department.members = department.members.filter(
        (id) => id.toString() !== user._id.toString()
      );

      // Send notification
      try {
        const notificationService = (await import('../utils/notificationService.js')).default;
        await notificationService.createNotification({
          type: 'user_unassigned',
          title: 'Department Assignment Updated',
          message: `You have been unassigned from the department: ${department.name}`,
          user: user._id,
          sender: req.user._id
        });
      } catch (notificationError) {
        console.error('Unassignment notification failed:', notificationError);
      }

      results.push({
        userId: user._id,
        name: user.name,
        status: 'unassigned'
      });

      // Emit socket event
      // emitUserUnassigned(user._id, departmentId); // Individual events disabled for bulk operations

    } catch (error) {
      console.error(`Error unassigning user ${user._id}:`, error);
      errors.push({
        userId: user._id,
        name: user.name,
        error: error.message
      });
    }
  }

  // Save department changes
  await department.save();

  // Emit bulk socket event for real-time updates
  emitBulkUsersUnassigned(results.map(r => r.userId), departmentId);

  // Invalidate caches
  invalidateCache(`/api/departments/${departmentId}`);
  invalidateCache('/api/users');

  res.status(200).json({
    success: true,
    data: {
      unassigned: results,
      errors: errors,
      totalAttempted: userIds.length,
      totalUnassigned: results.length,
      totalErrors: errors.length
    }
  });
});

// @desc    Get department filter options for header dropdown (optimized)
// @route   GET /api/departments/filter-options
// @access  Private
export const getUserDepartmentFilterOptions = asyncHandler(async (req, res) => {
  const user = req.user;
  const isAdmin = user.role === 'admin';
  
  let departments;
  let showAllOption = false;
  
  if (isAdmin) {
    // Admin sees all departments
    departments = await Department.find({ isActive: true })
      .select('_id name')
      .sort('name')
      .lean();
    showAllOption = true;
  } else {
    // Non-admin users see only their assigned departments
    const userDeptIds = Array.isArray(user.department) ? user.department : [];
    
    if (userDeptIds.length === 0) {
      // User has no departments assigned
      return res.status(200).json({
        success: true,
        data: {
          departments: [],
          showAllOption: false,
          defaultDepartmentId: null,
          hasNoDepartments: true
        }
      });
    }
    
    departments = await Department.find({ 
      _id: { $in: userDeptIds },
      isActive: true 
    })
      .select('_id name')
      .sort('name')
      .lean();
    
    // Show "All Departments" option only if user has more than 1 department
    showAllOption = departments.length > 1;
  }
  
  // Determine default selection
  // If only one department, select it; otherwise default to 'all'
  const defaultDepartmentId = departments.length === 1 ? departments[0]._id : 'all';
  
  res.status(200).json({
    success: true,
    data: {
      departments,
      showAllOption,
      defaultDepartmentId,
      hasNoDepartments: departments.length === 0
    }
  });
});

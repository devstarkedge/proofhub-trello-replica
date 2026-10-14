import { updateMemberAccess } from '../authz/accessAdminService.js';
import mongoose from 'mongoose';
import Department from "../models/Department.js";
import User from "../models/User.js";
import Board from "../models/Board.js";
import Card from "../models/Card.js";
import Subtask from "../models/Subtask.js";
import SubtaskNano from "../models/SubtaskNano.js";
import Role from "../models/Role.js";
import asyncHandler from "../middleware/asyncHandler.js";
import { ErrorResponse } from "../middleware/errorHandler.js";
import { emitUserAssigned, emitUserUnassigned, emitBulkUsersAssigned, emitBulkUsersUnassigned } from "../realtime/index.js";
import { invalidateAuthCache } from "../middleware/authMiddleware.js";
import { runBackground, createNotificationInBackground } from '../utils/backgroundTasks.js';
import { resolveDepartmentScope } from '../utils/departmentStats.js';
import { getAssignmentBasedBoardIds, getAssignmentBasedDepartmentIds, userHasCapability, CAPABILITIES } from '../services/permissionService.js';
import { chatHooks } from '../utils/chatHooks.js';
import { syncMembershipFromUser, isActiveWorkspaceMember } from '../modules/workspaces/membershipSyncService.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { createDepartmentCore } from '../modules/workspaces/departmentCreation.js';
import * as workspaceContext from '../modules/workspaces/workspaceContext.js';

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
      const rawDept = user.department;
      const userDeptIds = (Array.isArray(rawDept) ? rawDept : (rawDept ? [rawDept] : []))
        .map(d => d?._id || d);
      const uid = user._id || user.id;
      query = {
        isActive: true,
        $or: [
          { _id: { $in: userDeptIds } },
          { members: uid },
          { managers: uid }
        ]
      };
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

// @desc    Get department stats (role-aware)
// @route   GET /api/departments/stats/summary
// @access  Private (Admin/Manager)
export const getDepartmentStats = asyncHandler(async (req, res, next) => {
  const user = req.user;
  if (!user) {
    return next(new ErrorResponse('Not authorized', 401));
  }

  const requestedDepartmentId = req.query.departmentId || req.query.department || null;
  let scope;

  try {
    scope = resolveDepartmentScope({
      role: user.role,
      department: user.department,
      requestedDepartmentId
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 403));
  }

  const { departmentIds } = scope;

  if (Array.isArray(departmentIds) && departmentIds.length === 0) {
    return res.status(200).json({
      success: true,
      data: {
        totalDepartments: 0,
        totalManagers: 0,
        totalMembers: 0,
        avgMembersPerDept: 0
      }
    });
  }

  const matchQuery = { isActive: true };
  if (Array.isArray(departmentIds)) {
    matchQuery._id = { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const [departmentTotals, employeeCount] = await Promise.all([
    Department.aggregate([
      { $match: matchQuery },
      {
        $project: {
          managersCount: { $size: { $ifNull: ['$managers', []] } }
        }
      },
      {
        $group: {
          _id: null,
          totalDepartments: { $sum: 1 },
          totalManagers: { $sum: '$managersCount' }
        }
      }
    ]),
    WorkspaceMembership.countDocuments({ workspace: req.workspaceId, status: 'active', role: 'employee',
      ...(Array.isArray(departmentIds)
        ? { department: { $in: departmentIds.map((id) => new mongoose.Types.ObjectId(id)) } }
        : {})
    })
  ]);

  const totals = departmentTotals[0] || { totalDepartments: 0, totalManagers: 0 };
  const totalMembers = employeeCount || 0;
  const avgMembersPerDept = totals.totalDepartments > 0
    ? Math.round(totalMembers / totals.totalDepartments)
    : 0;

  res.status(200).json({
    success: true,
    data: {
      totalDepartments: totals.totalDepartments,
      totalManagers: totals.totalManagers,
      totalMembers: totalMembers,
      avgMembersPerDept
    }
  });
});

// @desc    Get all active departments (Public for registration)
// @route   GET /api/departments/public
// @access  Public
export const getPublicDepartments = asyncHandler(async (req, res, next) => {
  const departments = await workspaceContext.runUnscoped(async () => {
    return Department.find({ isActive: true })
      .select('name')
      .sort('name');
  });

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

  // Determine access type first — needed for both dept and project match queries
  const isEmployee = userHasCapability(user, CAPABILITIES.FORCE_ASSIGNMENT_SCOPE);
  const userAccessType = (user.role === 'admin') ? 'full_department'
    : isEmployee ? 'assigned_tasks'
    : (user.accessType || 'full_department');

  if (user) {
    if (user.role !== 'admin') {
      // Static: departments the user is formally a member of
      const userDeptIds = Array.isArray(user.department) ? user.department : [];

      // Dynamic: departments the user has cross-dept access to via task/subtask/nano assignment
      // Example: user is in "Shopify" dept but assigned a task in a "Frontend" dept project
      let dynamicDeptIds = [];
      if (userAccessType === 'assigned_tasks') {
        dynamicDeptIds = await getAssignmentBasedDepartmentIds(user.id);
      }

      // Union of static + dynamic, deduplicated
      const seen = new Set();
      const allDeptIds = [];
      for (const id of [...userDeptIds, ...dynamicDeptIds]) {
        const key = id.toString();
        if (!seen.has(key)) {
          seen.add(key);
          allDeptIds.push(new mongoose.Types.ObjectId(key));
        }
      }

      matchQuery._id = { $in: allDeptIds };
    }
    // Admin users see all departments (no additional filter)
  }

  const projectMatchFilter = {
    workspaceId: new mongoose.Types.ObjectId(req.workspaceId),
    $expr: { $eq: ['$department', '$$deptId'] },
    isArchived: false,
    isDeleted: { $ne: true }
  };
  if (userAccessType === 'selected_projects') {
    const allowedIds = (user.allowedProjects || []).map(id => new mongoose.Types.ObjectId(id.toString()));
    projectMatchFilter._id = { $in: allowedIds };
  } else if (userAccessType === 'assigned_tasks') {
    const uid = new mongoose.Types.ObjectId(user.id);
    // Collect board IDs from task/subtask/nano-subtask assignees PLUS direct board ownership/membership
    const assignedBoardIds = await getAssignmentBasedBoardIds(user.id);
    projectMatchFilter.$or = [
      { owner: uid },
      { members: uid },
      { _id: { $in: assignedBoardIds } }
    ];
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
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1, role: 1 } }],
        as: 'managers'
      }
    },
    // Lookup members
    {
      $lookup: {
        from: 'users',
        localField: 'members',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, email: 1, avatar: 1, role: 1 } }],
        as: 'members'
      }
    },
    // Lookup projects (boards) — filtered by user's accessType
    {
      $lookup: {
        from: 'boards',
        let: { deptId: '$_id' },
        pipeline: [
          { $match: projectMatchFilter },
          { $project: { name: 1, description: 1, background: 1, members: 1, managers: 1, status: 1, coverImage: 1, coverImageHistory: 1, startDate: 1, dueDate: 1, projectCategory: 1, projectType: 1, createdAt: 1 } }
        ],
        as: 'projects'
      }
    },
    // Lookup all cards for this department's projects (include status and isArchived for progress calculation)
    // For 'assigned_tasks' users: restrict to cards assigned to them so progress reflects their own tasks
    {
      $lookup: {
        from: 'cards',
        let: { projectIds: '$projects._id' },
        pipeline: [
          { $match: { $expr: { $and: [
            { $in: ['$board', '$$projectIds'] },
            ...(userAccessType === 'assigned_tasks'
              ? [{ $in: [new mongoose.Types.ObjectId(user.id), { $ifNull: ['$assignees', []] }] }]
              : [])
          ] } } },
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

  // Populate authoritative projectManagers and taskMembers for each project
  const allProjectIds = [];
  const deptManagerIdSets = new Map(); // deptIdStr -> Set<userIdStr>

  for (const dept of departments) {
    const mgrSet = new Set((dept.managers || []).map(m => (m?._id || m)?.toString()).filter(Boolean));
    deptManagerIdSets.set(dept._id.toString(), mgrSet);
    for (const proj of dept.projects || []) {
      if (proj._id) allProjectIds.push(proj._id);
    }
  }

  if (allProjectIds.length > 0) {
    const [cards, subtasks, nanos] = await Promise.all([
      Card.find({ board: { $in: allProjectIds }, isArchived: { $ne: true } })
        .select('board assignees members')
        .lean(),
      Subtask.find({ board: { $in: allProjectIds } })
        .select('board assignees')
        .lean(),
      SubtaskNano.find({ board: { $in: allProjectIds } })
        .select('board assignees')
        .lean(),
    ]);

    const boardAssigneesMap = new Map();
    const allReferencedUserIds = new Set();

    const addAssignee = (boardId, userId) => {
      if (!boardId || !userId) return;
      const bKey = boardId.toString();
      const uKey = (userId._id || userId).toString();
      if (!boardAssigneesMap.has(bKey)) {
        boardAssigneesMap.set(bKey, new Set());
      }
      boardAssigneesMap.get(bKey).add(uKey);
      allReferencedUserIds.add(uKey);
    };

    for (const c of cards) {
      if (Array.isArray(c.assignees)) c.assignees.forEach(u => addAssignee(c.board, u));
      if (Array.isArray(c.members)) c.members.forEach(u => addAssignee(c.board, u));
    }
    for (const s of subtasks) {
      if (Array.isArray(s.assignees)) s.assignees.forEach(u => addAssignee(s.board, u));
    }
    for (const n of nanos) {
      if (Array.isArray(n.assignees)) n.assignees.forEach(u => addAssignee(n.board, u));
    }

    // Also collect all user IDs referenced in project.members, project.managers, dept.managers
    for (const dept of departments) {
      for (const proj of dept.projects || []) {
        if (Array.isArray(proj.members)) {
          for (const m of proj.members) {
            const uid = (m?._id || m)?.toString();
            if (uid) allReferencedUserIds.add(uid);
          }
        }
        if (Array.isArray(proj.managers)) {
          for (const m of proj.managers) {
            const uid = (m?._id || m)?.toString();
            if (uid) allReferencedUserIds.add(uid);
          }
        }
      }
      for (const m of dept.managers || []) {
        const uid = (m?._id || m)?.toString();
        if (uid) allReferencedUserIds.add(uid);
      }
    }

    const validUserObjectIds = Array.from(allReferencedUserIds)
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const workspaceId = req.workspaceId ? new mongoose.Types.ObjectId(req.workspaceId) : null;

    const [userDocs, membershipDocs] = await Promise.all([
      User.find({ _id: { $in: validUserObjectIds } })
        .select('name email avatar role')
        .lean(),
      workspaceId
        ? WorkspaceMembership.find({
            workspace: workspaceId,
            user: { $in: validUserObjectIds },
            status: { $ne: 'removed' }
          })
            .select('user role roleId status')
            .lean()
        : []
    ]);

    const usersMap = new Map(userDocs.map(u => [u._id.toString(), u]));
    const membershipsMap = new Map(membershipDocs.map(m => [m.user.toString(), m]));

    const roleIds = Array.from(new Set(membershipDocs.map(m => m.roleId).filter(Boolean)));
    const roleDocs = roleIds.length > 0
      ? await Role.find({ _id: { $in: roleIds } }).select('slug templateKey permissions name').lean()
      : [];
    const rolesMap = new Map(roleDocs.map(r => [r._id.toString(), r]));

    const isManagerOrAdmin = (userIdStr, deptIdStr) => {
      if (!userIdStr) return false;
      if (deptIdStr && deptManagerIdSets.get(deptIdStr)?.has(userIdStr)) {
        return true;
      }
      const mem = membershipsMap.get(userIdStr);
      if (mem) {
        const memRole = (mem.role || '').toLowerCase();
        if (memRole === 'admin' || memRole === 'manager') return true;
        if (mem.roleId) {
          const r = rolesMap.get(mem.roleId.toString());
          if (r) {
            const slug = (r.slug || '').toLowerCase();
            const template = (r.templateKey || '').toLowerCase();
            if (slug === 'admin' || slug === 'manager' || template === 'admin' || template === 'manager') {
              return true;
            }
            if (r.permissions && (
              r.permissions.canManageSystem ||
              r.permissions.canManageRoles ||
              r.permissions.canManageUsers ||
              r.permissions.canCreateProject
            )) {
              return true;
            }
          }
        }
      }
      const u = usersMap.get(userIdStr);
      if (u) {
        const userRole = (u.role || '').toLowerCase();
        if (userRole === 'admin' || userRole === 'manager') return true;
      }
      return false;
    };

    for (const dept of departments) {
      const deptIdStr = dept._id.toString();
      for (const proj of dept.projects || []) {
        // Resolve project managers: from proj.members & proj.managers eligible as managers
        const managerIdSet = new Set();
        if (Array.isArray(proj.members)) {
          for (const m of proj.members) {
            const mid = (m?._id || m)?.toString();
            if (mid && (deptManagerIdSets.get(deptIdStr)?.has(mid) || isManagerOrAdmin(mid, deptIdStr))) {
              managerIdSet.add(mid);
            }
          }
        }
        if (Array.isArray(proj.managers)) {
          for (const m of proj.managers) {
            const mid = (m?._id || m)?.toString();
            if (mid) managerIdSet.add(mid);
          }
        }

        const projectManagers = Array.from(managerIdSet).map(mid => {
          const u = usersMap.get(mid) || (dept.managers || []).find(m => String(m._id) === mid);
          if (!u) return null;
          return {
            _id: u._id || mid,
            name: u.name || 'Manager',
            email: u.email || '',
            avatar: u.avatar || null,
            role: 'manager'
          };
        }).filter(Boolean);

        // Resolve task members: unique users assigned to tasks, excluding admins/managers
        const assignedUserIds = boardAssigneesMap.get(proj._id.toString()) || new Set();
        const taskMembers = Array.from(assignedUserIds)
          .filter(uid => !isManagerOrAdmin(uid, deptIdStr))
          .map(uid => {
            const u = usersMap.get(uid);
            if (!u) return null;
            const mem = membershipsMap.get(uid);
            return {
              _id: u._id,
              name: u.name || 'Member',
              email: u.email || '',
              avatar: u.avatar || null,
              role: mem?.role || u.role || 'employee'
            };
          })
          .filter(Boolean)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        proj.projectManagers = projectManagers;
        proj.taskMembers = taskMembers;
      }
    }
  }

  if (req.query.compact === 'true') {
    // Home only needs assignment IDs; avoid repeating full project descriptions
    // and cover metadata for every assigned member in the response.
    for (const department of departments) {
      for (const [memberId, projects] of Object.entries(department.projectsWithMemberAssignments || {})) {
        department.projectsWithMemberAssignments[memberId] = projects.map(project => ({ _id: project._id }));
      }
    }
  }

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

  const department = await createDepartmentCore({ name, description, managers, workspaceId: req.workspaceId });

  // Dispatch chat webhook
  chatHooks.onDepartmentCreated(department, req.user).catch(console.error);

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

  const oldManagers = department.managers || [];
  let managersToAdd = [];
  let managersToRemove = [];

  if (managers !== undefined) {
    const newManagers = managers || [];
    const oldIds = new Set(oldManagers.map(String)), newIds = new Set(newManagers.map(String));
    managersToAdd = newManagers.filter(id => !oldIds.has(String(id)));
    managersToRemove = oldManagers.filter(id => !newIds.has(String(id)));

    // New appointments require active workspace membership. Removal must
    // remain possible for former/suspended managers already on this roster.
    const candidateIds = managersToAdd;
    if (candidateIds.length > 0) {
      const validIds = await WorkspaceMembership.find({
        workspace: req.workspaceId,
        user: { $in: candidateIds },
        status: 'active'
      }).distinct('user');
      const validSet = new Set(validIds.map(String));
      const invalid = candidateIds.filter((id) => !validSet.has(String(id)));
      if (invalid.length > 0) {
        return next(new ErrorResponse('One or more managers are not members of this workspace', 403));
      }
    }
  }

  // Same validation as managers above, applied to members — this array was
  // previously overwritten with zero membership checking at all.
  if (members) {
    const validMemberIds = await WorkspaceMembership.find({
      workspace: req.workspaceId,
      user: { $in: members },
      status: 'active'
    }).distinct('user');
    const validMemberSet = new Set(validMemberIds.map(String));
    const invalidMembers = members.filter((id) => !validMemberSet.has(String(id)));
    if (invalidMembers.length > 0) {
      return next(new ErrorResponse('One or more members are not members of this workspace', 403));
    }
  }

  // Track changes for webhook
  const changes = {};

  // Update fields
  if (name && department.name !== name) {
    changes.name = name;
    department.name = name;
  }
  if (description !== undefined && department.description !== description) {
    changes.description = description;
    department.description = description;
  }
  if (managers !== undefined) department.managers = managers;
  if (members) department.members = members;
  if (isActive !== undefined && department.isActive !== isActive) {
    changes.isActive = isActive;
    department.isActive = isActive;
  }

  await department.save();

  // Update managers' department field
  if (managers !== undefined) {
    // Add department to new managers
    if (managersToAdd.length > 0) {
      await WorkspaceMembership.updateMany(
        { workspace: req.workspaceId, status: 'active', user: { $in: managersToAdd } },
        { $addToSet: { department: department._id } }
      );
    }

    // Remove department from old managers (only if they have no other roles in this department)
    if (managersToRemove.length > 0) {
      await WorkspaceMembership.updateMany(
        { workspace: req.workspaceId, status: 'active', user: { $in: managersToRemove } },
        { $pull: { department: department._id } }
      );
    }

  }

  if (managers !== undefined || members !== undefined || isActive !== undefined) {
    const assigned = await WorkspaceMembership.find({ workspace: req.workspaceId, department: department._id, status: 'active' }).distinct('user');
    await Promise.all([...new Set([...oldManagers, ...(department.managers || []), ...assigned].map(String))].map(userId => syncMembershipFromUser(userId, req.workspaceId)));
  }

  // Populate managers data before returning
  await department.populate("managers", "name email");

  // Dispatch chat webhook if there were substantive changes
  if (Object.keys(changes).length > 0) {
    chatHooks.onDepartmentUpdated(department, changes, req.user).catch(console.error);
  }

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

  // Every workspace must have at least one department (Board.department is
  // a hard schema requirement — a project can never exist without one).
  // Without this guard, deleting the last department would silently violate
  // that invariant and permanently block project creation in this workspace.
  const departmentCount = await Department.countDocuments({});
  if (departmentCount <= 1) {
    return next(new ErrorResponse(
      "Cannot delete the last department in a workspace — create another department first",
      400
    ));
  }

  // Remove department from users (use $pull for array field)
  const affectedUsers = await WorkspaceMembership.find({ workspace: req.workspaceId, $or: [{ department: department._id }, { user: { $in: department.managers || [] } }] }).distinct('user');
  await WorkspaceMembership.updateMany(
    { workspace: req.workspaceId, department: req.params.id },
    { $pull: { department: req.params.id } }
  );

  // Actually delete the department from database
  await Department.findByIdAndDelete(req.params.id);
  await Promise.all(affectedUsers.map(userId => syncMembershipFromUser(userId, req.workspaceId)));

  // Dispatch chat webhook
  chatHooks.onDepartmentDeleted(department, req.user).catch(console.error);

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
  if (user) { const membership = await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: user._id, status: 'active' }).lean(); user.department = membership?.department || []; user.role = membership?.role || ''; }

  if (!department) {
    return next(new ErrorResponse("Department not found", 404));
  }

  if (!user) {
    return next(new ErrorResponse("User not found", 404));
  }

  if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
    return next(new ErrorResponse("User is not a member of this workspace", 403));
  }

  // Check if user is already assigned to a DIFFERENT department.
  // user.department is an array (schema: [{ type: ObjectId }]).
  // Normalise defensively so the check is safe for empty arrays, null, or scalars.
  const existingDepts = Array.isArray(user.department)
    ? user.department
    : user.department
      ? [user.department]
      : [];

  const alreadyInThisDept = existingDepts.some(d => d.toString() === req.params.id);

  if (!alreadyInThisDept && existingDepts.length > 0) {
    const currentDept = await Department.findById(existingDepts[0]);
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

  // Update user's department field — push rather than overwrite so the array stays intact
  await WorkspaceMembership.findOneAndUpdate({ workspace: req.workspaceId, user: userId, status: 'active' }, {
    $addToSet: { department: req.params.id }
  });

  // Mirrors into the affected user's workspace membership (and busts their
  // cache) so the next request fetches the updated department list from
  // the database (no re-login required).
  await syncMembershipFromUser(userId, req.workspaceId);

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
        sender: req.user._id,
        entityId: department._id,
        entityType: 'Department',
        departmentId: department._id,
        metadata: {
          departmentId: department._id,
          departmentName: department.name,
          url: '/'
        }
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

    if (!(await isActiveWorkspaceMember(req.params.userId, req.workspaceId))) {
      return next(new ErrorResponse("User is not a member of this workspace", 403));
    }

    // Use $pull to remove from array
    await Department.findByIdAndUpdate(req.params.id, {
      $pull: { members: req.params.userId, managers: req.params.userId }
    });

    // Update user's department field
    await WorkspaceMembership.findOneAndUpdate({ workspace: req.workspaceId, user: req.params.userId, status: 'active' }, {
      $pull: { department: req.params.id },
    });

    // Mirrors into the membership row (and busts the cache) so stale
    // department data is not served.
    await syncMembershipFromUser(req.params.userId, req.workspaceId);

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
  if (user) { const membership = await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: user._id, status: 'active' }).lean(); user.department = membership?.department || []; user.role = membership?.role || ''; }
    const department = await Department.findById(deptId);

    if (!user) {
      return next(new ErrorResponse("User not found", 404));
    }

    if (!department) {
      return next(new ErrorResponse("Department not found", 404));
    }

    if (!(await isActiveWorkspaceMember(user._id, req.workspaceId))) {
      return next(new ErrorResponse("User is not a member of this workspace", 403));
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
    await updateMemberAccess({ workspaceId: req.workspaceId, userId: user._id, actor: req.user, patch: { department: user.department } });
    await syncMembershipFromUser(user._id, req.workspaceId);

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
        sender: req.user._id,
        entityId: department._id,
        entityType: 'Department',
        departmentId: department._id,
        metadata: {
          departmentId: department._id,
          departmentName: department.name,
          url: '/'
        }
      });
    } catch (error) {
      console.error('Unassignment notification failed:', error);
    }

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

  // Members must already belong to this workspace — otherwise
  // syncMembershipFromUser's upsert below would silently create a
  // membership for a user from a different workspace.
  const activeMemberIds = new Set(
    (await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' }).distinct('user')).map(String)
  );

  const results = [];
  const errors = [];

  // Process each user assignment
  for (const user of users) {
    try {
      const membership = await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: user._id, status: 'active' }).lean();
      user.department = membership?.department || []; user.role = membership?.role || '';
      if (!activeMemberIds.has(String(user._id))) {
        errors.push({
          userId: user._id,
          name: user.name,
          error: 'User is not a member of this workspace'
        });
        continue;
      }

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
        await updateMemberAccess({ workspaceId: req.workspaceId, userId: user._id, actor: req.user, patch: { department: user.department } });
        // Mirrors into the membership row (and busts the cache) so the
        // user's next request sees the updated departments.
        await syncMembershipFromUser(user._id, req.workspaceId);
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
          sender: req.user._id,
          entityId: department._id,
          entityType: 'Department',
          departmentId: department._id,
          metadata: {
            departmentId: department._id,
            departmentName: department.name,
            url: '/'
          }
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

  // Members must already belong to this workspace — otherwise
  // syncMembershipFromUser's upsert below would silently create a
  // membership for a user from a different workspace.
  const activeMemberIds = new Set(
    (await WorkspaceMembership.find({ workspace: req.workspaceId, status: 'active' }).distinct('user')).map(String)
  );

  const results = [];
  const errors = [];

  // Process each user unassignment
  for (const user of users) {
    try {
      const membership = await WorkspaceMembership.findOne({ workspace: req.workspaceId, user: user._id, status: 'active' }).lean();
      user.department = membership?.department || []; user.role = membership?.role || '';
      if (!activeMemberIds.has(String(user._id))) {
        errors.push({
          userId: user._id,
          name: user.name,
          error: 'User is not a member of this workspace'
        });
        continue;
      }

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
      await updateMemberAccess({ workspaceId: req.workspaceId, userId: user._id, actor: req.user, patch: { department: user.department } });
      // Mirrors into the membership row (and busts the cache) so the
      // user's next request sees the updated departments.
      await syncMembershipFromUser(user._id, req.workspaceId);

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
          sender: req.user._id,
          entityId: department._id,
          entityType: 'Department',
          departmentId: department._id,
          metadata: {
            departmentId: department._id,
            departmentName: department.name,
            url: '/'
          }
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

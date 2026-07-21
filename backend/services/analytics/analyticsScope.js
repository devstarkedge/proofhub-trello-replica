import mongoose from 'mongoose';
import Department from '../../models/Department.js';
import Board from '../../models/Board.js';
import Card from '../../models/Card.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const objectId = (value) => new mongoose.Types.ObjectId(value);
const idString = (value) => value?._id?.toString() || value?.toString();

export const ANALYTICS_ROLES = Object.freeze({
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
});

export const canonicalBillingType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'hr' || normalized === 'hourly') return 'hr';
  if (normalized === 'fixed' || normalized === 'milestone') return normalized;
  return '';
};

export const getAnalyticsRole = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  if (role === ANALYTICS_ROLES.ADMIN) return ANALYTICS_ROLES.ADMIN;
  if (role === ANALYTICS_ROLES.MANAGER) return ANALYTICS_ROLES.MANAGER;
  return ANALYTICS_ROLES.EMPLOYEE;
};

export const resolveAnalyticsScope = async (user) => {
  const role = getAnalyticsRole(user);
  const userId = objectId(user._id || user.id);
  let departmentQuery = { isActive: true };

  if (role === ANALYTICS_ROLES.MANAGER) {
    const assigned = (Array.isArray(user.department) ? user.department : [user.department])
      .filter(Boolean)
      .map(idString);
    departmentQuery = {
      isActive: true,
      $or: [
        { _id: { $in: assigned.map(objectId) } },
        { managers: userId },
      ],
    };
  } else if (role === ANALYTICS_ROLES.EMPLOYEE) {
    departmentQuery = {
      isActive: true,
      $or: [{ members: userId }, { managers: userId }, { _id: { $in: (user.department || []).filter(Boolean) } }],
    };
  }

  const departments = await Department.find(departmentQuery)
    .select('_id name managers members')
    .sort({ name: 1 })
    .lean();
  const departmentIds = departments.map((department) => department._id);

  let boardQuery = {
    department: { $in: departmentIds },
    isArchived: { $ne: true },
    isDeleted: { $ne: true },
  };

  if (role === ANALYTICS_ROLES.EMPLOYEE) {
    const assignedBoardIds = await Card.distinct('board', {
      assignees: userId,
      isArchived: { $ne: true },
    });
    boardQuery = {
      ...boardQuery,
      $or: [
        { _id: { $in: assignedBoardIds } },
        { owner: userId },
        { members: userId },
      ],
    };
  } else if (role === ANALYTICS_ROLES.MANAGER && user.accessType === 'selected_projects') {
    boardQuery._id = { $in: (user.allowedProjects || []).map((id) => objectId(idString(id))) };
  }

  const boards = await Board.find(boardQuery)
    .select('_id name department team owner members status priority projectType billingCycle clientDetails startDate dueDate createdAt updatedAt')
    .sort({ name: 1 })
    .lean();

  return {
    role,
    userId,
    personalOnly: role === ANALYTICS_ROLES.EMPLOYEE,
    departments,
    departmentIds,
    boards,
    boardIds: boards.map((board) => board._id),
  };
};

export const assertScopeFilter = (scope, filters) => {
  const allowed = {
    departmentId: new Set(scope.departmentIds.map(idString)),
    projectId: new Set(scope.boardIds.map(idString)),
  };

  for (const field of Object.keys(allowed)) {
    if (filters[field] && !allowed[field].has(filters[field])) {
      throw new ErrorResponse(`You do not have access to the requested ${field.replace('Id', '')}`, 403);
    }
  }
};

export const filterScopedBoards = (scope, filters) => scope.boards.filter((board) => {
  if (filters.departmentId && idString(board.department) !== filters.departmentId) return false;
  if (filters.projectId && idString(board._id) !== filters.projectId) return false;
  if (filters.teamId && idString(board.team) !== filters.teamId) return false;
  if (filters.managerId && idString(board.owner) !== filters.managerId) return false;
  if (filters.billingType && canonicalBillingType(board.billingCycle) !== canonicalBillingType(filters.billingType)) return false;
  if (filters.client) {
    const client = String(board.clientDetails?.clientName || '').toLowerCase();
    if (!client.includes(filters.client.toLowerCase())) return false;
  }
  return true;
});

export const scopeBoardsToEmployeeProjects = (boards, projectTaskRows, employeeId) => {
  if (!employeeId) return boards;
  const assignedProjectIds = new Set(projectTaskRows.map((project) => idString(project._id)));
  return boards.filter((board) => assignedProjectIds.has(idString(board._id)));
};

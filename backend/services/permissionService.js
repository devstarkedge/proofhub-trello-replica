/**
 * Permission Service
 *
 * Provides:
 *  - CAPABILITIES constant map (access-scope level)
 *  - computeUserCapabilities(user) — derives capability set from role + accessType
 *  - getAssignmentBasedBoardIds(userId) — all boards an employee is assigned to
 *    via Card, Subtask, or SubtaskNano assignees arrays
 */

import mongoose from 'mongoose';

// ─── Capability Constants ────────────────────────────────────────────────────

export const CAPABILITIES = Object.freeze({
  // Visibility
  VIEW_ALL_PROJECTS: 'VIEW_ALL_PROJECTS',           // admin only
  VIEW_DEPT_PROJECTS: 'VIEW_DEPT_PROJECTS',         // manager — all projects in their depts
  VIEW_SELECTED_PROJECTS: 'VIEW_SELECTED_PROJECTS', // selected_projects whitelist
  VIEW_ASSIGNED_PROJECTS: 'VIEW_ASSIGNED_PROJECTS', // assigned_tasks — derived from assignments

  // Management
  MANAGE_PROJECT: 'MANAGE_PROJECT',
  ASSIGN_PROJECT_ACCESS: 'ASSIGN_PROJECT_ACCESS',
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_MEMBERS: 'MANAGE_MEMBERS',

  // Scope enforcement
  FORCE_ASSIGNMENT_SCOPE: 'FORCE_ASSIGNMENT_SCOPE', // employees — cannot have wider scope
});

// ─── Role → Capability Mapping ───────────────────────────────────────────────

const ROLE_CAPABILITIES = {
  admin: new Set([
    CAPABILITIES.VIEW_ALL_PROJECTS,
    CAPABILITIES.VIEW_DEPT_PROJECTS,
    CAPABILITIES.VIEW_SELECTED_PROJECTS,
    CAPABILITIES.VIEW_ASSIGNED_PROJECTS,
    CAPABILITIES.MANAGE_PROJECT,
    CAPABILITIES.ASSIGN_PROJECT_ACCESS,
    CAPABILITIES.MANAGE_ROLES,
    CAPABILITIES.MANAGE_MEMBERS,
  ]),
  manager: new Set([
    CAPABILITIES.VIEW_DEPT_PROJECTS,
    CAPABILITIES.VIEW_SELECTED_PROJECTS,
    CAPABILITIES.VIEW_ASSIGNED_PROJECTS,
    CAPABILITIES.MANAGE_PROJECT,
    CAPABILITIES.ASSIGN_PROJECT_ACCESS,
    CAPABILITIES.MANAGE_MEMBERS,
  ]),
  hr: new Set([
    CAPABILITIES.VIEW_DEPT_PROJECTS,
    CAPABILITIES.VIEW_SELECTED_PROJECTS,
    CAPABILITIES.VIEW_ASSIGNED_PROJECTS,
    CAPABILITIES.MANAGE_MEMBERS,
    CAPABILITIES.ASSIGN_PROJECT_ACCESS,
  ]),
  employee: new Set([
    CAPABILITIES.VIEW_ASSIGNED_PROJECTS,
    CAPABILITIES.FORCE_ASSIGNMENT_SCOPE,
  ]),
};

/**
 * Return a Set of capability strings for the given user object.
 * Falls back to employee capabilities for unrecognised roles.
 */
export const computeUserCapabilities = (user) => {
  const role = (user?.role || 'employee').toLowerCase();
  return ROLE_CAPABILITIES[role] ?? ROLE_CAPABILITIES.employee;
};

/**
 * Quick helper — does this user have a specific capability?
 */
export const userHasCapability = (user, capability) => {
  return computeUserCapabilities(user).has(capability);
};

// ─── Assignment-Based Board Lookup ───────────────────────────────────────────

/**
 * Return a deduplicated array of Board ObjectIds the user is assigned to
 * through any of: Card.assignees, Subtask.assignees, SubtaskNano.assignees.
 *
 * Uses Model.distinct() for efficiency — single aggregation per collection.
 * All three schemas store `board` as a direct ObjectId ref on the document.
 */
export const getAssignmentBasedBoardIds = async (userId) => {
  const userObjectId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : null;

  if (!userObjectId) return [];

  // Dynamic imports avoid circular dependencies (controllers import from services)
  const { default: Card } = await import('../models/Card.js');
  const { default: Subtask } = await import('../models/Subtask.js');
  const { default: SubtaskNano } = await import('../models/SubtaskNano.js');

  const [cardBoards, subtaskBoards, nanoBoards] = await Promise.all([
    Card.distinct('board', { assignees: userObjectId, isArchived: { $ne: true } }),
    Subtask.distinct('board', { assignees: userObjectId }),
    SubtaskNano.distinct('board', { assignees: userObjectId }),
  ]);

  // Merge and deduplicate using string keys
  const seen = new Set();
  const merged = [];
  for (const id of [...cardBoards, ...subtaskBoards, ...nanoBoards]) {
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(id);
    }
  }

  return merged;
};

import mongoose from 'mongoose';
import Board from '../models/Board.js';
import Department from '../models/Department.js';
import Card from '../models/Card.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import { userHasCapability, CAPABILITIES, getAssignmentBasedBoardIds } from '../services/permissionService.js';

/**
 * Enterprise Single Source of Truth for Board/Project Access Control
 *
 * Rules:
 * 1. Admin or user with VIEW_ALL_PROJECTS capability -> Allowed
 * 2. Board owner -> Allowed
 * 3. Explicit board member -> Allowed
 * 4. Public board -> Allowed
 * 5. User has this board in their allowedProjects whitelist -> Allowed
 * 6. User belongs to the department that owns the board (or is a member/manager of the dept) -> Allowed
 * 7. User belongs to the same team assigned to the board -> Allowed
 * 8. User is assigned to any card, subtask, or nano-subtask in this board -> Allowed
 *
 * Can accept either an already-loaded Board document / plain object, or a Board ID (ObjectId / string).
 */
export async function canUserAccessBoard(boardOrId, user, accessFacts = null) {
  if (!boardOrId || !user) return false;

  // 1. Admin or capability VIEW_ALL_PROJECTS
  if (user.role === 'admin' || userHasCapability(user, CAPABILITIES.VIEW_ALL_PROJECTS)) {
    return true;
  }

  const userId = (user._id || user.id)?.toString();
  if (!userId) return false;

  // Resolve board if an ID was passed
  let board = boardOrId;
  if (typeof boardOrId === 'string' || boardOrId instanceof mongoose.Types.ObjectId) {
    if (!mongoose.Types.ObjectId.isValid(boardOrId)) return false;
    board = await Board.findById(boardOrId)
      .select('owner members visibility isDeleted department team')
      .lean();
  }

  if (!board || board.isDeleted) return false;

  // 2. Direct owner
  const ownerId = (typeof board.owner === 'object' ? board.owner?._id : board.owner)?.toString();
  if (ownerId && ownerId === userId) {
    return true;
  }

  // 3. Direct board members
  if (board.members && Array.isArray(board.members)) {
    if (board.members.some((m) => (m?._id || m)?.toString() === userId)) {
      return true;
    }
  }

  // 4. Public board
  if (board.visibility === 'public') {
    return true;
  }

  // 5. Allowed projects whitelist
  if (user.allowedProjects && Array.isArray(user.allowedProjects)) {
    const allowed = user.allowedProjects.map((p) => (p?._id || p)?.toString());
    if (allowed.includes(board._id?.toString())) {
      return true;
    }
  }

  // 6. Department matching
  const boardDeptId = (typeof board.department === 'object' ? board.department?._id : board.department)?.toString();
  if (boardDeptId) {
    const userDeptIds = Array.isArray(user.department)
      ? user.department.map(d => (typeof d === 'object' ? d._id?.toString() || d.toString() : d.toString()))
      : user.department ? [(typeof user.department === 'object' ? user.department._id?.toString() || user.department.toString() : user.department.toString())] : [];
    if (userDeptIds.includes(boardDeptId)) {
      return true;
    }
    // Also check department roster in DB (members or managers)
    if (accessFacts?.departmentIds?.has(boardDeptId)) return true;
    if (!accessFacts) {
      try {
        const deptDoc = await Department.findOne({
          _id: boardDeptId,
          $or: [
            { members: user._id || user.id },
            { managers: user._id || user.id }
          ]
        }).select('_id').lean();
        if (deptDoc) {
          return true;
        }
      } catch {
        // Continue to next check
      }
    }
  }

  // 7. Team matching
  const boardTeamId = (typeof board.team === 'object' ? board.team?._id : board.team)?.toString();
  const userTeamId = (typeof user.team === 'object' ? user.team?._id : user.team)?.toString();
  if (boardTeamId && userTeamId && boardTeamId === userTeamId) {
    return true;
  }

  // Request-scoped facts are resolved once for a batch of projects.
  if (accessFacts && accessFacts.assignedBoardIds) {
    return accessFacts.assignedBoardIds.has(board._id?.toString());
  }

  // 8. Assignment-based: check if user is assigned to any card, subtask, or nano on this board
  try {
    const assignedBoardIds = await getAssignmentBasedBoardIds(userId);
    if (assignedBoardIds.some(id => id.toString() === board._id?.toString())) {
      return true;
    }
  } catch {
    // Fall back to direct check
  }

  // Direct card/subtask/nano assignee check for this specific board
  try {
    const hasCardAssignment = await Card.exists({ board: board._id, assignees: user._id || user.id });
    if (hasCardAssignment) return true;
    const hasSubtaskAssignment = await Subtask.exists({ board: board._id, assignees: user._id || user.id });
    if (hasSubtaskAssignment) return true;
    const hasNanoAssignment = await SubtaskNano.exists({ board: board._id, assignees: user._id || user.id });
    if (hasNanoAssignment) return true;
  } catch {
    // End of checks
  }

  return false;
}

export default canUserAccessBoard;

import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';
import { canUserAccessBoard } from './boardAccess.js';
/**
 * Small, focused entity-access check for notification fan-out (currently
 * used by @mention resolution — notificationService.js#processMentions —
 * and available to the notification decision engine for any future
 * producer that needs it).
 *
 * This intentionally reuses the same board-visibility rules already
 * enforced ad hoc in boardController.js (owner / member / public visibility
 * / admin role / assignment-based access for employees / allowedProjects
 * whitelist for selected_projects users) rather than inventing a new
 * authority model. It is a second, independent implementation of that
 * check (boardController.js doesn't expose it as a callable helper) —
 * flagged as a known, accepted duplication rather than a new authorization
 * concept; if the codebase later grows a shared "canAccessBoard" helper,
 * this should be rewritten to call it instead.
 *
 * Callers must already be inside an active workspaceContext (request
 * handlers have this ambiently via `protect`; background workers must call
 * workspaceContext.run({ workspaceId }, ...) themselves) since board/card
 * lookups here go through workspaceScopePlugin.
 */

import mongoose from 'mongoose';
import Board from '../models/Board.js';
import Card from '../models/Card.js';
import Comment from '../models/Comment.js';
import Subtask from '../models/Subtask.js';
import SubtaskNano from '../models/SubtaskNano.js';
import WorkspaceMembership from '../models/WorkspaceMembership.js';
import { getAssignmentBasedBoardIds, userHasCapability, CAPABILITIES } from '../services/permissionService.js';

async function userCanAccessBoard({ userId, boardId }) {
  if (!boardId || !mongoose.Types.ObjectId.isValid(boardId)) return false;

  const board = await Board.findById(boardId).select('owner members visibility isDeleted').lean();
  if (!board || board.isDeleted) return false;

  const membership = await WorkspaceMembership.findOne({ user: userId, workspace: getActiveWorkspaceId(), status: 'active' })
    .select('role accessType allowedProjects')
    .lean();
  if (!membership) return false;

  return canUserAccessBoard(board, { _id: userId, id: userId, role: membership.role, allowedProjects: membership.allowedProjects || [] });

}

/**
 * Resolves a notification's target entity down to its owning board (where
 * applicable) and checks board-level access for the given user.
 *
 * Entity types with no board-membership concept (Announcement, Team,
 * WorkspaceJoinRequest, ...) pass through as accessible — their recipient
 * lists are already computed correctly by their own producers (subscriber
 * resolution / team membership), this is defense-in-depth for
 * board/task-scoped entities only, not a new check for those.
 */
export async function userCanAccessEntity({ userId, entityType, entityId }) {
  if (!userId || !entityType || !entityId) return true;

  switch (entityType) {
    case 'LeaveRequest': {
      if (!mongoose.isValidObjectId(entityId)) return false;
      const workspaceId = getActiveWorkspaceId();
      const { canViewLeaveRequest } = await import('../modules/leave/leaveAuthorization.service.js');
      const membership = await WorkspaceMembership.findOne({ workspace: workspaceId, user: userId, status: 'active' }).select('role').lean();
      return Boolean(membership && await canViewLeaveRequest({ viewer: { _id: userId, role: membership.role }, requestId: entityId, workspaceId }));
    }
    case 'Card': {
      const card = await Card.findById(entityId).select('board').lean();
      if (!card) return false;
      return userCanAccessBoard({ userId, boardId: card.board });
    }
    case 'Board': {
      return userCanAccessBoard({ userId, boardId: entityId });
    }
    case 'Comment': {
      const comment = await Comment.findById(entityId).select('card').lean();
      if (!comment) return false;
      const card = await Card.findById(comment.card).select('board').lean();
      if (!card) return false;
      return userCanAccessBoard({ userId, boardId: card.board });
    }
    case 'Subtask': {
      const subtask = await Subtask.findById(entityId).select('board').lean();
      if (!subtask) return false;
      return userCanAccessBoard({ userId, boardId: subtask.board });
    }
    case 'SubtaskNano': {
      const nano = await SubtaskNano.findById(entityId).select('board').lean();
      if (!nano) return false;
      return userCanAccessBoard({ userId, boardId: nano.board });
    }
    default:
      return true;
  }
}

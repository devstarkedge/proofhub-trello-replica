import express from 'express';
import { body } from 'express-validator';
import {
  inviteMember, listJoinRequests, approveJoinRequestHandler, rejectJoinRequestHandler, getMemberActivityLog
} from '../controllers/memberInvitationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import { requireWorkspacePermission } from '../middleware/requireWorkspacePermission.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { passwordValidator } from '../utils/passwordPolicy.js';

// Second router mounted at the same /api/workspaces prefix as
// routes/workspaces.js — kept in its own file so the centralized Invite
// Member system's routes stay fully separable from the legacy ones (some of
// which this feature retires outright in a later cleanup pass).
const router = express.Router();

router.use(protect);

router.post('/:id/invite-member', rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many invite requests — please try again later'
}), requireWorkspacePermission('canInviteMembers'), [
  body('method').isIn(['direct', 'self_register']).withMessage('method must be "direct" or "self_register"'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('temporaryPassword').if(body('method').equals('direct'))
    .custom(passwordValidator()),
  validate
], inviteMember);

router.get('/:id/join-requests', requireWorkspacePermission('canApproveJoinRequests'), listJoinRequests);
router.patch('/:id/join-requests/:requestId/approve', requireWorkspacePermission('canApproveJoinRequests'), approveJoinRequestHandler);
router.patch('/:id/join-requests/:requestId/reject', requireWorkspacePermission('canApproveJoinRequests'), [
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  validate
], rejectJoinRequestHandler);

router.get('/:id/member-activity-log', getMemberActivityLog);

export default router;

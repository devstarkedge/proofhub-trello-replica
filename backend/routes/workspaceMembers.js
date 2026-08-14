import express from 'express';
import { body } from 'express-validator';
import {
  inviteMember, listJoinRequests, approveJoinRequestHandler, rejectJoinRequestHandler, getMemberActivityLog,
  listInvitationsHandler, resendInvitationHandler, revokeInvitationHandler
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

// Per-target-email bound, ON TOP of the per-IP limiter below — stops one
// address from being spammed regardless of how many IPs/accounts attempt
// it. Only meaningful for the single-recipient methods (direct/
// self_register); bulk_simple's `emails` array has no single `req.body.email`
// to key on, and folding its whole array into one workspace-wide bucket
// would incorrectly couple unrelated bulk invites together, so it's
// deliberately left to the existing 1-20-per-request cap plus the per-IP/
// per-workspace limiters instead (see rateLimiter.js's own "one Map per
// call site" convention — this is its own instance, not shared).
const inviteEmailLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many invitations sent to this address recently — please try again later',
  keyFn: (req) => `email:${req.params.id}:${String(req.body?.email || '').trim().toLowerCase()}`
});
const inviteEmailLimiterForSingleMethods = (req, res, next) => (
  req.body?.method === 'bulk_simple' ? next() : inviteEmailLimiter(req, res, next)
);

router.post('/:id/invite-member', rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many invite requests — please try again later'
}), inviteEmailLimiterForSingleMethods, requireWorkspacePermission('canInviteMembers'), [
  body('method').isIn(['direct', 'self_register', 'bulk_simple'])
    .withMessage('method must be "direct", "self_register", or "bulk_simple"'),
  body('email').if(body('method').isIn(['direct', 'self_register']))
    .isEmail().withMessage('A valid email is required'),
  body('emails').if(body('method').equals('bulk_simple'))
    .isArray({ min: 1, max: 20 }).withMessage('emails must contain between 1 and 20 addresses'),
  body('emails.*').if(body('method').equals('bulk_simple'))
    .isEmail().withMessage('Each entry in emails must be a valid email address'),
  body('temporaryPassword').if(body('method').equals('direct'))
    .custom(passwordValidator()),
  validate
], inviteMember);

router.get('/:id/invitations', rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  message: 'Too many requests — please slow down'
}), requireWorkspacePermission('canInviteMembers'), listInvitationsHandler);

router.patch('/:id/invitations/:invitationId/resend', rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many resend requests — please try again later'
}), rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 100,
  message: 'Too many resend requests for this workspace — please try again later',
  keyFn: (req) => `ws:${req.params.id}`
}), requireWorkspacePermission('canInviteMembers'), resendInvitationHandler);

router.patch('/:id/invitations/:invitationId/revoke', rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 60,
  message: 'Too many revoke requests — please try again later'
}), requireWorkspacePermission('canInviteMembers'), revokeInvitationHandler);

router.get('/:id/join-requests', requireWorkspacePermission('canApproveJoinRequests'), listJoinRequests);
router.patch('/:id/join-requests/:requestId/approve', requireWorkspacePermission('canApproveJoinRequests'), approveJoinRequestHandler);
router.patch('/:id/join-requests/:requestId/reject', requireWorkspacePermission('canApproveJoinRequests'), [
  body('reason').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  validate
], rejectJoinRequestHandler);

router.get('/:id/member-activity-log', getMemberActivityLog);

export default router;

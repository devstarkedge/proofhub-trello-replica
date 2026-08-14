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
// deliberately left to the bulk-request-frequency limiter below plus the
// per-IP/per-workspace limiters instead (see rateLimiter.js's own "one Map
// per call site" convention — this is its own instance, not shared).
const inviteEmailLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many invitations sent to this address recently — please try again later',
  keyFn: (req) => `email:${req.params.id}:${String(req.body?.email || '').trim().toLowerCase()}`
});
const inviteEmailLimiterForSingleMethods = (req, res, next) => (
  req.body?.method === 'bulk_simple' ? next() : inviteEmailLimiter(req, res, next)
);

// Bulk requests can each carry up to 200 emails, so the general 30/hr
// per-IP limiter alone isn't a meaningful bound on total volume (30 * 200 =
// 6000/hr) — this caps how often the bulk method itself can be invoked,
// independent of the single-invite methods sharing the same route.
const bulkInviteLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  message: 'Too many bulk invite requests — please try again later',
  keyFn: (req) => `bulk:${req.ip || req.connection.remoteAddress}`
});
const bulkInviteLimiterForBulkMethod = (req, res, next) => (
  req.body?.method === 'bulk_simple' ? bulkInviteLimiter(req, res, next) : next()
);

// Per-user, ON TOP of per-IP — an IP is a shared/spoofable proxy for "who is
// doing this," a logged-in user id is the real identity. Bounds one account
// across multiple IPs (VPN/proxy hopping) the way the per-IP limiter alone
// cannot; matches the per-user limiter already on the accept endpoint (see
// routes/invitations.js).
const inviteUserLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  message: 'Too many invite requests from this account — please try again later',
  keyFn: (req) => `user:${req.user?.id}`
});

router.post('/:id/invite-member', rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many invite requests — please try again later'
}), inviteUserLimiter, inviteEmailLimiterForSingleMethods, bulkInviteLimiterForBulkMethod, requireWorkspacePermission('canInviteMembers'), [
  body('method').isIn(['direct', 'self_register', 'bulk_simple'])
    .withMessage('method must be "direct", "self_register", or "bulk_simple"'),
  body('email').if(body('method').isIn(['direct', 'self_register']))
    .isEmail().withMessage('A valid email is required'),
  body('emails').if(body('method').equals('bulk_simple'))
    .isArray({ min: 1, max: 200 }).withMessage('emails must contain between 1 and 200 addresses'),
  body('emails.*').if(body('method').equals('bulk_simple'))
    .isEmail().withMessage('Each entry in emails must be a valid email address'),
  body('role').if(body('method').equals('bulk_simple'))
    .optional({ checkFalsy: true }).isString().trim().isLength({ max: 50 }),
  body('department').if(body('method').equals('bulk_simple'))
    .optional({ checkFalsy: true }).isMongoId().withMessage('Invalid department'),
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
}), rateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  message: 'Too many resend requests from this account — please try again later',
  keyFn: (req) => `user:${req.user?.id}`
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

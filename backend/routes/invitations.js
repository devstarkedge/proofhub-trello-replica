import express from 'express';
import { getInvitationByToken, acceptWorkspaceInvitation } from '../controllers/invitationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public — a brand-new visitor with no account yet must be able to see
// what workspace they're invited to before registering.
router.get('/:token', rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many requests — please slow down'
}), getInvitationByToken);

// Requires an authenticated session — see registration/login flows for how
// a brand-new user reaches this after creating their account. The token
// itself is an unguessable 32-byte random value, but nothing previously
// bounded an authenticated account hammering accept attempts (e.g. against
// guessed/leaked invitationIds via a different endpoint), so this is keyed
// per-user rather than per-IP.
router.post('/:token/accept', protect, rateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many attempts — please slow down',
  keyFn: (req) => req.user?.id || req.ip
}), acceptWorkspaceInvitation);

export default router;

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
// a brand-new user reaches this after creating their account.
router.post('/:token/accept', protect, acceptWorkspaceInvitation);

export default router;

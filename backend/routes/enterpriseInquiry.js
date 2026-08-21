import express from 'express';
import { body } from 'express-validator';
import { submitEnterpriseInquiry } from '../controllers/enterpriseInquiryController.js';
import { validate } from '../middleware/validation.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public — must work for a signed-out visitor from the marketing pricing
// page, not just a logged-in user routed here from the workspace creation
// wizard's Plan step. IP-rate-limited (no auth to key off of), matching
// routes/auth.js's public-route precedent.
router.post('/', rateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: 'Too many inquiries submitted — please try again later.'
}), [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('email').isEmail().withMessage('A valid email is required').isLength({ max: 254 }),
  body('membersInTeam').trim().notEmpty().withMessage('Members in team is required').isLength({ max: 50 }),
  body('companyType').trim().notEmpty().withMessage('Company type is required').isLength({ max: 100 }),
  body('location').trim().notEmpty().withMessage('Location is required').isLength({ max: 100 }),
  body('message').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
  body('idempotencyKey').trim().notEmpty().withMessage('idempotencyKey is required').isLength({ max: 100 }),
  validate
], submitEnterpriseInquiry);

export default router;

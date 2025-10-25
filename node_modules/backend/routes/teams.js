import express from 'express';
import { body } from 'express-validator';
import { getTeams, getTeam, createTeam, updateTeam, addMember, deleteTeam, inviteUser, joinTeam, removeMember } from '../controllers/teamController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/', protect, getTeams);
router.get('/:id', protect, getTeam);

router.post('/', protect, authorize('admin', 'manager'), [
  body('name').trim().notEmpty().withMessage('Team name is required'),
  body('department').notEmpty().withMessage('Department is required'),
  validate
], createTeam);

router.put('/:id', protect, authorize('admin', 'manager'), updateTeam);
router.post('/:id/members', protect, authorize('admin', 'manager'), [
  body('userId').notEmpty().withMessage('User ID is required'),
  validate
], addMember);
router.delete('/:id', protect, authorize('admin', 'manager'), deleteTeam);

// Legacy routes for compatibility
router.post('/:teamId/invite', protect, inviteUser);
router.post('/join/:token', protect, joinTeam);
router.delete('/:teamId/members/:userId', protect, removeMember);

export default router;

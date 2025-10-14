import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { adminOnly, managerOrAdmin } from '../middleware/rbacMiddleware.js';
import { createTeam, inviteUser, joinTeam, removeMember, getTeams } from '../controllers/teamController.js';

const router = express.Router();

// Create a team
router.post('/', authMiddleware, managerOrAdmin, createTeam);

// Invite user to team
router.post('/:teamId/invite', authMiddleware, managerOrAdmin, inviteUser);

// Join team via invite link
router.post('/join/:token', authMiddleware, joinTeam);

// Remove member from team
router.delete('/:teamId/members/:userId', authMiddleware, managerOrAdmin, removeMember);

// Get user's teams
router.get('/', authMiddleware, getTeams);

export default router;

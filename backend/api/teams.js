import express from 'express';
import { body } from 'express-validator';
import { getTeams, getTeam, createTeam, updateTeam, deleteTeam, addMember, removeMember, leaveTeam } from '../controllers/teamController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import connectDB from '../utils/db.js';

const router = express.Router();

// Connect to database
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ message: 'Database connection failed' });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    await getTeams(req, res);
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ message: 'Failed to get teams' });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    await getTeam(req, res);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ message: 'Failed to get team' });
  }
});

router.post('/', protect, [
  body('name').trim().notEmpty().withMessage('Team name is required'),
  body('description').optional().trim(),
  validate
], async (req, res) => {
  try {
    await createTeam(req, res);
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ message: 'Failed to create team' });
  }
});

router.put('/:id', protect, async (req, res) => {
  try {
    await updateTeam(req, res);
  } catch (error) {
    console.error('Update team error:', error);
    res.status(500).json({ message: 'Failed to update team' });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await deleteTeam(req, res);
  } catch (error) {
    console.error('Delete team error:', error);
    res.status(500).json({ message: 'Failed to delete team' });
  }
});

router.post('/:id/members', protect, [
  body('email').isEmail().withMessage('Valid email is required'),
  validate
], async (req, res) => {
  try {
    await addMember(req, res);
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ message: 'Failed to add member' });
  }
});

router.delete('/:id/members/:userId', protect, async (req, res) => {
  try {
    await removeMember(req, res);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

router.post('/:id/leave', protect, async (req, res) => {
  try {
    await leaveTeam(req, res);
  } catch (error) {
    console.error('Leave team error:', error);
    res.status(500).json({ message: 'Failed to leave team' });
  }
});

export default router;

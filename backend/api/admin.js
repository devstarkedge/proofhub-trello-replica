import express from 'express';
import { getDashboard, getUsers, getStats, updateUserRole, deleteUser, getSystemLogs } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
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

// All admin routes require admin role
router.use(protect, authorize('admin'));

router.get('/dashboard', async (req, res) => {
  try {
    await getDashboard(req, res);
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ message: 'Failed to get dashboard data' });
  }
});

router.get('/users', async (req, res) => {
  try {
    await getUsers(req, res);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to get users' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    await getStats(req, res);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Failed to get statistics' });
  }
});

router.get('/logs', async (req, res) => {
  try {
    await getSystemLogs(req, res);
  } catch (error) {
    console.error('Get system logs error:', error);
    res.status(500).json({ message: 'Failed to get system logs' });
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    await updateUserRole(req, res);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Failed to update user role' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await deleteUser(req, res);
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
});

export default router;

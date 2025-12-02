import express from 'express';
import { getUsers, getUser, updateUser, deleteUser, verifyUser, getProfile, updateProfile, updateSettings, assignUser, declineUser, getVerifiedUsers, getUsersByDepartments, getManagerUsers } from '../controllers/userController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { hrOrAdmin, managerHrOrAdmin, ownerOrAdminManager } from '../middleware/rbacMiddleware.js';
import { getVapidKeys } from '../utils/pushNotification.js';

const router = express.Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.put('/settings', protect, updateSettings);

// Push notification routes (must come before parameterized routes)
router.get('/push-key', protect, (req, res) => {
  try {
    const vapidKeys = getVapidKeys();
    if (!vapidKeys) {
      return res.status(500).json({ message: 'VAPID keys not configured' });
    }
    res.json({ vapidPublicKey: vapidKeys.publicKey });
  } catch (error) {
    console.error('Error getting VAPID keys:', error);
    res.status(500).json({ message: 'Failed to get push keys' });
  }
});

router.post('/push-subscription', protect, async (req, res) => {
  try {
    const { subscription } = req.body;
    const User = (await import('../models/User.js')).default;
    await User.findByIdAndUpdate(req.user.id, {
      pushSubscription: subscription
    });
    res.json({ message: 'Push subscription saved' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ message: 'Failed to save push subscription' });
  }
});

router.delete('/push-subscription', protect, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    await User.findByIdAndUpdate(req.user.id, {
      $unset: { pushSubscription: 1 }
    });
    res.json({ message: 'Push subscription removed' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ message: 'Failed to remove push subscription' });
  }
});

// Announcement audience endpoints
router.get('/verified', protect, hrOrAdmin, getVerifiedUsers);
router.get('/by-departments', protect, hrOrAdmin, getUsersByDepartments);
router.get('/managers', protect, hrOrAdmin, getManagerUsers);

// Admin and HR can view all users, Manager can view users in their department/team
router.get('/', protect, hrOrAdmin, getUsers);

// All authenticated users can view individual user profiles
router.get('/:id', protect, getUser);

// Admin can update any user, users can update their own profile
router.put('/:id', protect, ownerOrAdminManager, updateUser);

// Only admin can verify users
router.put('/:id/verify', protect, authorize('admin'), verifyUser);

// Only admin can decline user registrations
router.delete('/:id/decline', protect, authorize('admin'), declineUser);

// Admin and Manager can assign Employee to departments/teams
router.put('/:id/assign', protect, managerHrOrAdmin, assignUser);

// Only admin can delete users
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;

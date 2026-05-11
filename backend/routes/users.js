import express from 'express';
import multer from 'multer';
import { getUsers, getUser, updateUser, deleteUser, verifyUser, getProfile, updateProfile, updateSettings, assignUser, declineUser, getVerifiedUsers, getUsersByDepartments, getManagerUsers, changeUserRole, getUserPagePermissions, patchUserPagePermissions } from '../controllers/userController.js';
import { uploadAvatar, uploadAvatarFromGoogleDrive, removeAvatar } from '../controllers/avatarController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { hrOrAdmin, managerHrOrAdmin, ownerOrAdminManager } from '../middleware/rbacMiddleware.js';
import { getPushStatusForDevice, getVapidKeys, removeUserPushSubscription, saveUserPushSubscription } from '../utils/pushNotification.js';

const router = express.Router();

// Configure multer for avatar upload (memory storage)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP allowed.'), false);
    }
  }
});

// Avatar routes
router.post('/avatar', protect, avatarUpload.single('avatar'), uploadAvatar);
router.post('/avatar/google-drive', protect, uploadAvatarFromGoogleDrive);
router.delete('/avatar', protect, removeAvatar);

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
    const user = await saveUserPushSubscription(req.user.id, req.body || {});
    res.json({
      message: 'Push subscription saved',
      data: {
        subscriptions: user?.pushSubscriptions || []
      }
    });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ message: 'Failed to save push subscription' });
  }
});

router.get('/push-subscription/status', protect, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id).select('settings.notifications pushSubscriptions pushSubscription');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const status = getPushStatusForDevice(user, {
      endpoint: req.query.endpoint?.toString() || null,
      deviceId: req.query.deviceId?.toString() || null,
    });

    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error loading push subscription status:', error);
    res.status(500).json({ message: 'Failed to load push subscription status' });
  }
});

router.delete('/push-subscription', protect, async (req, res) => {
  try {
    const user = await removeUserPushSubscription(req.user.id, {
      endpoint: req.body?.endpoint || req.query?.endpoint || null,
      deviceId: req.body?.deviceId || req.query?.deviceId || null,
    });
    res.json({
      message: 'Push subscription removed',
      data: {
        subscriptions: user?.pushSubscriptions || []
      }
    });
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

// Page/module permissions (self can read; only admin can update)
router.get('/:id/permissions', protect, getUserPagePermissions);
router.patch('/:id/permissions', protect, authorize('admin'), patchUserPagePermissions);

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

// Only admin can change user roles
router.put('/:id/role', protect, authorize('admin'), changeUserRole);

// Only admin can delete users
router.delete('/:id', protect, authorize('admin'), deleteUser);

export default router;

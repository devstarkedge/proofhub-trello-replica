import { rateLimiter } from '../middleware/rateLimiter.js';
import express from 'express';
import mongoose from 'mongoose';
import { 
  getNotifications, 
  getUnreadCount,
  markAsRead, 
  markAllAsRead, 
  archiveNotification,
  bulkArchive,
  getArchivedNotifications,
  restoreNotification,
  deleteNotification, 
  bulkDelete,
  clearAll,
  sendTestNotification,
  subscribeToFeature
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route for subscription - No protect middleware
router.post('/subscribe', protect, rateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 5 }), subscribeToFeature);

// Get notifications with pagination & filters
router.get('/', protect, getNotifications);

// Get unread count (fast endpoint)
router.get('/unread-count', protect, getUnreadCount);

// Get archived notifications
router.get('/archived', protect, getArchivedNotifications);
// Native clicks resolve one persisted recipient-owned notification, not an
// arbitrary renderer URL or a bounded first-page search that can miss it.
router.get('/:id', protect, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid notification reference' });
    const { default: Notification } = await import('../models/Notification.js');
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user.id, workspaceId: req.workspaceId })
      .populate('sender', 'name avatar').populate('relatedCard', 'title').populate('relatedBoard', 'name').lean();
    if (!notification) return res.status(404).json({ message: 'Notification is no longer available' });
    res.json(notification);
  } catch (error) { next(error); }
});

// Mark single notification as read
router.put('/:id/read', protect, markAsRead);

// Mark all as read
router.put('/read-all', protect, markAllAsRead);

// Archive notification (soft delete)
router.put('/:id/archive', protect, archiveNotification);

// Restore archived notification
router.put('/:id/restore', protect, restoreNotification);

// Bulk archive
router.put('/bulk-archive', protect, bulkArchive);

// Clear all (archive all)
router.put('/clear-all', protect, clearAll);

// Delete notification permanently
router.delete('/bulk-delete', protect, bulkDelete);
router.delete('/:id', protect, deleteNotification);

// Bulk delete


// Send test notification
router.post('/test', protect, sendTestNotification);

export default router;

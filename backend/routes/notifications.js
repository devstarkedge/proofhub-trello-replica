import express from 'express';
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
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// Public route for subscription - No protect middleware
router.post('/subscribe', subscribeToFeature);

// Get notifications with pagination & filters
router.get('/', protect, cacheMiddleware('notifications', 60), getNotifications);

// Get unread count (fast endpoint)
router.get('/unread-count', protect, cacheMiddleware('notifications', 30), getUnreadCount);

// Get archived notifications
router.get('/archived', protect, getArchivedNotifications);

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
router.delete('/:id', protect, deleteNotification);

// Bulk delete
router.delete('/bulk-delete', protect, bulkDelete);

// Send test notification
router.post('/test', protect, sendTestNotification);

export default router;

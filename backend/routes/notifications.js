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
  sendTestNotification 
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get notifications with pagination & filters
router.get('/', protect, getNotifications);

// Get unread count (fast endpoint)
router.get('/unread-count', protect, getUnreadCount);

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

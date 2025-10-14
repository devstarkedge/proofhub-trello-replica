import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { getUserNotifications, markAsRead, deleteNotification } from '../controllers/notificationController.js';

const router = express.Router();

// Get user's notifications
router.get('/', authMiddleware, getUserNotifications);

// Mark notification as read
router.patch('/:id/read', authMiddleware, markAsRead);

// Delete notification
router.delete('/:id', authMiddleware, deleteNotification);

export default router;

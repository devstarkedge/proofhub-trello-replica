import express from 'express';
import { getNotifications, markAsRead, markAllAsRead, deleteNotification, sendTestNotification } from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.put('/:id/read', protect, markAsRead);
router.put('/read-all', protect, markAllAsRead);
router.delete('/:id', protect, deleteNotification);
router.post('/test', protect, sendTestNotification);

export default router;

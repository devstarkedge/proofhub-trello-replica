import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  getStatus,
  connect,
  disconnect,
  testConnection,
  triggerSync,
  getChatRedirectUrl,
} from '../controllers/chatIntegrationController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Redirect to ChatApp (any authenticated user)
router.get('/redirect', getChatRedirectUrl);

// Status check (any authenticated user)
router.get('/status', getStatus);

// Admin-only routes — connect, disconnect, test, sync
router.post('/connect', authorize('admin'), connect);
router.post('/disconnect', authorize('admin'), disconnect);
router.post('/test', authorize('admin'), testConnection);
router.post('/sync', authorize('admin'), triggerSync);

export default router;

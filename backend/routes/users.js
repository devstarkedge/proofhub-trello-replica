import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { getProfile } from '../controllers/userController.js';

const router = express.Router();

// Get user profile
router.get('/profile', authMiddleware, getProfile);

export default router;

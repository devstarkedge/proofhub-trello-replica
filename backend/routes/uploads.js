import express from 'express';
import { uploadImage } from '../controllers/uploadController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Upload an image (for card description or comment)
router.post('/image', protect, uploadImage);

export default router;

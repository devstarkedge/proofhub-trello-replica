import express from 'express';
import { globalSearch, searchCards } from '../controllers/searchController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, globalSearch);
router.get('/cards', protect, searchCards);

export default router;

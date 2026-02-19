import express from 'express';
import { globalSearch, searchCards } from '../controllers/searchController.js';
import { protect } from '../middleware/authMiddleware.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

router.get('/', protect, cacheMiddleware('search', 60), globalSearch);
router.get('/cards', protect, cacheMiddleware('search', 60), searchCards);

export default router;

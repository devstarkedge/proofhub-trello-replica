import express from 'express';
import { globalSearch, searchCards, getSuggestions } from '../controllers/searchController.js';
import { protect } from '../middleware/authMiddleware.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import config from '../config/index.js';

const router = express.Router();
router.use(protect, rateLimiter({ ...config.rateLimit.search, keyFn: req => String(req.user._id || req.user.id), allowReadFallback: true }));

router.get('/', protect, globalSearch);
router.get('/cards', protect, searchCards);
router.get('/suggestions', protect, getSuggestions);

export default router;

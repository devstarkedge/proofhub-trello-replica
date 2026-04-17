import express from 'express';
import { globalSearch, searchCards, getSuggestions } from '../controllers/searchController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', protect, globalSearch);
router.get('/cards', protect, searchCards);
router.get('/suggestions', protect, getSuggestions);

export default router;

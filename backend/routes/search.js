import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { globalSearch } from '../controllers/searchController.js';

const router = express.Router();

// Global search
router.get('/', authMiddleware, globalSearch);

export default router;

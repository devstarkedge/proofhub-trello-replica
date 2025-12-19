import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getProjectTrash } from '../controllers/trashController.js';

const router = express.Router();

router.use(protect);

// Project trash
router.get('/:id/trash', getProjectTrash);

export default router;

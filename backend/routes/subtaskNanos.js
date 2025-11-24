import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getNanosForSubtask,
  getNanoById,
  createNano,
  updateNano,
  deleteNano,
  reorderNanos
} from '../controllers/subtaskNanoController.js';

const router = express.Router();

router.get('/subtask/:subtaskId', protect, getNanosForSubtask);
router.post('/subtask/:subtaskId', protect, createNano);
router.post('/subtask/:subtaskId/reorder', protect, reorderNanos);

router.get('/:id', protect, getNanoById);
router.put('/:id', protect, updateNano);
router.delete('/:id', protect, deleteNano);

export default router;


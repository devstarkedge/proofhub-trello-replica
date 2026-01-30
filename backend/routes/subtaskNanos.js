import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getNanosForSubtask,
  getNanoById,
  createNano,
  updateNano,
  deleteNano,
  reorderNanos,
  getNanoActivity,
  addTimeEntry,
  updateTimeEntry,
  deleteTimeEntry
} from '../controllers/subtaskNanoController.js';

const router = express.Router();

router.get('/subtask/:subtaskId', protect, getNanosForSubtask);
router.post('/subtask/:subtaskId', protect, createNano);
router.post('/subtask/:subtaskId/reorder', protect, reorderNanos);

router.get('/:id/activity', protect, getNanoActivity);
router.get('/:id', protect, getNanoById);
router.put('/:id', protect, updateNano);
router.delete('/:id', protect, deleteNano);

router.post('/:id/time-tracking', protect, addTimeEntry);
router.put('/:id/time-tracking/:entryId', protect, updateTimeEntry);
router.delete('/:id/time-tracking/:entryId', protect, deleteTimeEntry);

export default router;


import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getSubtasksForTask,
  getSubtaskById,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks,
  getSubtaskActivity,
  addTimeEntry,
  updateTimeEntry,
  deleteTimeEntry
} from '../controllers/subtaskController.js';

const router = express.Router();

router.get('/task/:taskId', protect, getSubtasksForTask);
router.post('/task/:taskId', protect, createSubtask);
router.post('/task/:taskId/reorder', protect, reorderSubtasks);

router.get('/:id/activity', protect, getSubtaskActivity);
router.get('/:id', protect, getSubtaskById);
router.put('/:id', protect, updateSubtask);
router.delete('/:id', protect, deleteSubtask);

router.post('/:id/time-tracking', protect, addTimeEntry);
router.put('/:id/time-tracking/:entryId', protect, updateTimeEntry);
router.delete('/:id/time-tracking/:entryId', protect, deleteTimeEntry);

export default router;


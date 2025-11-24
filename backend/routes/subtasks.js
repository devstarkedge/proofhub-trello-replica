import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getSubtasksForTask,
  getSubtaskById,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  reorderSubtasks
} from '../controllers/subtaskController.js';

const router = express.Router();

router.get('/task/:taskId', protect, getSubtasksForTask);
router.post('/task/:taskId', protect, createSubtask);
router.post('/task/:taskId/reorder', protect, reorderSubtasks);

router.get('/:id', protect, getSubtaskById);
router.put('/:id', protect, updateSubtask);
router.delete('/:id', protect, deleteSubtask);

export default router;


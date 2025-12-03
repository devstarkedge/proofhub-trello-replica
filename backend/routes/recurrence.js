import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  createRecurrence,
  getRecurrenceByCard,
  getRecurrenceById,
  getAllRecurrences,
  updateRecurrence,
  deleteRecurrence,
  triggerRecurrence
} from '../controllers/recurrenceController.js';

const router = express.Router();

// Create new recurrence
router.post('/', protect, createRecurrence);

// Get recurrence by card ID
router.get('/card/:cardId', protect, getRecurrenceByCard);

// Get all recurrences for a board/project
router.get('/all/:boardId', protect, getAllRecurrences);

// Get recurrence by ID
router.get('/:id', protect, getRecurrenceById);

// Update recurrence
router.patch('/:id', protect, updateRecurrence);

// Delete/Stop recurrence
router.delete('/:id', protect, deleteRecurrence);

// Manually trigger recurrence (create next instance)
router.post('/:id/trigger', protect, triggerRecurrence);

export default router;

import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { cacheMiddleware } from '../middleware/cache.js';
import {
  getLabelsByBoard,
  createLabel,
  updateLabel,
  deleteLabel,
  addLabelsToCard,
  removeLabelsFromCard,
  addLabelsToSubtask,
  removeLabelsFromSubtask,
  addLabelsToNano,
  removeLabelsFromNano,
  syncLabels
} from '../controllers/labelController.js';

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Label CRUD routes
router.get('/board/:boardId', cacheMiddleware('labels', 300), getLabelsByBoard);
router.post('/', createLabel);
router.put('/:id', updateLabel);
router.delete('/:id', deleteLabel);

// Card label routes
router.post('/card/:cardId', addLabelsToCard);
router.delete('/card/:cardId', removeLabelsFromCard);

// Subtask label routes
router.post('/subtask/:subtaskId', addLabelsToSubtask);
router.delete('/subtask/:subtaskId', removeLabelsFromSubtask);

// Nano-subtask label routes
router.post('/nano/:nanoId', addLabelsToNano);
router.delete('/nano/:nanoId', removeLabelsFromNano);

// Sync labels route (bulk update)
router.post('/sync', syncLabels);

export default router;

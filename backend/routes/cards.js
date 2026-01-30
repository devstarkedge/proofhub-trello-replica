import express from 'express';
import { body } from 'express-validator';
import { getCards, getCardsByBoard, getCardsByDepartment, getCard, createCard, updateCard, moveCard, deleteCard, getCardActivity, archiveCard, restoreCard, getArchivedCards, addTimeEntry, updateTimeEntry, deleteTimeEntry } from '../controllers/cardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.get('/list/:listId', protect, getCards);
router.get('/list/:listId/archived', protect, getArchivedCards);
router.get('/board/:boardId', protect, getCardsByBoard);
router.get('/department/:departmentId', protect, getCardsByDepartment);
router.get('/:id/activity', protect, getCardActivity);
router.get('/:id', protect, getCard);

router.post('/', protect, [
  body('title').trim().notEmpty().withMessage('Card title is required'),
  body('list').notEmpty().withMessage('List ID is required'),
  body('board').notEmpty().withMessage('Board ID is required'),
  validate
], createCard);

router.put('/:id', protect, updateCard);
router.put('/:id/move', protect, moveCard);
router.put('/:id/archive', protect, archiveCard);
router.put('/:id/restore', protect, restoreCard);
router.delete('/:id', protect, deleteCard);

router.post('/:id/time-tracking', protect, addTimeEntry);
router.put('/:id/time-tracking/:entryId', protect, updateTimeEntry);
router.delete('/:id/time-tracking/:entryId', protect, deleteTimeEntry);

export default router;

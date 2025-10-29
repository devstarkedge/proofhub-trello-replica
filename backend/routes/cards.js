import express from 'express';
import { body } from 'express-validator';
import { getCards, getCardsByBoard, getCardsByDepartment, getCard, createCard, updateCard, moveCard, deleteCard } from '../controllers/cardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.get('/list/:listId', protect, getCards);
router.get('/board/:boardId', protect, getCardsByBoard);
router.get('/department/:departmentId', protect, getCardsByDepartment);
router.get('/:id', protect, getCard);

router.post('/', protect, [
  body('title').trim().notEmpty().withMessage('Card title is required'),
  body('list').notEmpty().withMessage('List ID is required'),
  body('board').notEmpty().withMessage('Board ID is required'),
  validate
], createCard);

router.put('/:id', protect, updateCard);
router.put('/:id/move', protect, moveCard);
router.delete('/:id', protect, deleteCard);

export default router;

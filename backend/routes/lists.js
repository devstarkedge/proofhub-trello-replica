import express from 'express';
import { body } from 'express-validator';
import { getLists, createList, updateList, updateListPosition, deleteList } from '../controllers/listController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/board/:boardId', protect, getLists);

router.post('/', protect, [
  body('title').trim().notEmpty().withMessage('List title is required'),
  body('board').notEmpty().withMessage('Board ID is required'),
  validate
], createList);

router.put('/:id', protect, updateList);
router.put('/:id/position', protect, updateListPosition);
router.delete('/:id', protect, deleteList);

export default router;

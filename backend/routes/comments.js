import express from 'express';
import { body } from 'express-validator';
import { getCommentsByCard, createComment, updateComment, deleteComment } from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/card/:cardId', protect, getCommentsByCard);

router.post('/', protect, [
  body('text').trim().notEmpty().withMessage('Comment text is required'),
  body('card').notEmpty().withMessage('Card ID is required'),
  validate
], createComment);

router.put('/:id', protect, updateComment);
router.delete('/:id', protect, deleteComment);

export default router;

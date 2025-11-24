import express from 'express';
import { body } from 'express-validator';
import {
  getCommentsByCard,
  getCommentsBySubtask,
  getCommentsByNano,
  createComment,
  updateComment,
  deleteComment
} from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/card/:cardId', protect, getCommentsByCard);
router.get('/subtask/:subtaskId', protect, getCommentsBySubtask);
router.get('/nano/:nanoId', protect, getCommentsByNano);

router.post('/', protect, [
  body('htmlContent').trim().notEmpty().withMessage('Comment content is required'),
  body().custom((value, { req }) => {
    if (!req.body.card && !req.body.subtask && !req.body.subtaskNano) {
      throw new Error('A task, subtask, or subtask-nano reference is required');
    }
    return true;
  }),
  validate
], createComment);

router.put('/:id', protect, updateComment);
router.delete('/:id', protect, deleteComment);

export default router;

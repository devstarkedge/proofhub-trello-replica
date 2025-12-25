import express from 'express';
import { body } from 'express-validator';
import {
  getCommentsByCard,
  getCommentsBySubtask,
  getCommentsByNano,
  createComment,
  createReply,
  getReplies,
  updateComment,
  deleteComment,
  addReaction,
  removeReaction,
  pinComment,
  unpinComment,
  getCommentById
} from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

// ============================================================================
// GET COMMENTS
// ============================================================================
router.get('/card/:cardId', protect, getCommentsByCard);
router.get('/subtask/:subtaskId', protect, getCommentsBySubtask);
router.get('/nano/:nanoId', protect, getCommentsByNano);

// Get single comment by ID (for deep linking)
router.get('/:id', protect, getCommentById);

// ============================================================================
// CREATE COMMENT
// ============================================================================
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

// ============================================================================
// THREADED REPLIES
// ============================================================================
// Create a reply to a comment
router.post('/:id/reply', protect, [
  body('htmlContent').trim().notEmpty().withMessage('Reply content is required'),
  validate
], createReply);

// Get replies for a comment (paginated)
router.get('/:id/replies', protect, getReplies);

// ============================================================================
// REACTIONS
// ============================================================================
// Add reaction to a comment
router.post('/:id/reactions', protect, [
  body('emoji').isIn(['👍', '❤️', '😂', '🚀', '😮', '😢']).withMessage('Invalid emoji'),
  validate
], addReaction);

// Remove reaction from a comment
router.delete('/:id/reactions/:emoji', protect, removeReaction);

// ============================================================================
// PINNING
// ============================================================================
// Pin a comment (admin/manager only)
router.patch('/:id/pin', protect, pinComment);

// Unpin a comment (admin/manager only)
router.patch('/:id/unpin', protect, unpinComment);

// ============================================================================
// UPDATE & DELETE
// ============================================================================
router.put('/:id', protect, updateComment);
router.delete('/:id', protect, deleteComment);

export default router;

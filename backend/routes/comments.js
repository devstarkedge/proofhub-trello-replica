import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import { createComment, getCommentsByCard, updateComment, deleteComment } from '../controllers/commentController.js';

const router = express.Router();

// Create a comment
router.post('/', authMiddleware, createComment);

// Get comments for a card
router.get('/card/:cardId', authMiddleware, getCommentsByCard);

// Update a comment
router.patch('/:id', authMiddleware, updateComment);

// Delete a comment
router.delete('/:id', authMiddleware, deleteComment);

export default router;

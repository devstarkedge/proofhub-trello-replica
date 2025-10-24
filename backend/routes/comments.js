import express from 'express';
import { 
  getCommentsByCard, 
  createComment, 
  updateComment, 
  deleteComment 
} from '../controllers/commentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { commentValidation } from '../middleware/validation.js';

const router = express.Router();

// Get comments by card
router.get('/card/:cardId', protect, getCommentsByCard);

// Create comment
router.post('/', protect, commentValidation.create, createComment);

// Update comment (owner only)
router.put('/:id', protect, updateComment);

// Delete comment (owner only)
router.delete('/:id', protect, deleteComment);

export default router;
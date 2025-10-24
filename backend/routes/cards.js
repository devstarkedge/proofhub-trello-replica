import express from 'express';
import { 
  getCards, 
  getCardsByBoard, 
  getCard, 
  createCard, 
  updateCard, 
  moveCard, 
  deleteCard, 
  uploadAttachment 
} from '../controllers/cardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { cardValidation } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Get cards by list
router.get('/list/:listId', protect, getCards);

// Get cards by board
router.get('/board/:boardId', protect, getCardsByBoard);

// Get single card
router.get('/:id', protect, getCard);

// Create card
router.post('/', protect, cardValidation.create, createCard);

// Update card
router.put('/:id', protect, cardValidation.update, updateCard);

// Move card
router.patch('/:id/move', protect, moveCard);

// Delete card
router.delete('/:id', protect, deleteCard);

// Upload attachment
router.post('/:id/upload', protect, upload.single('file'), uploadAttachment);

export default router;
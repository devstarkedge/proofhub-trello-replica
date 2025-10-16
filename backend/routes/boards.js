import express from 'express';
import { body } from 'express-validator';
import { getBoards, getBoard, createBoard, updateBoard, deleteBoard, getBoardsByDepartment } from '../controllers/boardController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/', protect, getBoards);
router.get('/department/:departmentId', protect, getBoardsByDepartment);
router.get('/:id', protect, getBoard);

router.post('/', protect, [
  body('name').trim().notEmpty().withMessage('Board name is required'),
  validate
], createBoard);

router.put('/:id', protect, updateBoard);
router.delete('/:id', protect, deleteBoard);

export default router;

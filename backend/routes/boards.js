import express from 'express';
import { body } from 'express-validator';
import { getBoards, getBoard, createBoard, updateBoard, deleteBoard, getBoardsByDepartment, getWorkflowData } from '../controllers/boardController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.get('/', protect, getBoards);
router.get('/department/:departmentId', protect, getBoardsByDepartment);
router.get('/workflow/:departmentId/:projectId', protect, getWorkflowData);
router.get('/:id', protect, getBoard);

router.post('/', protect, upload.array('attachments', 10), [
  body('name').trim().notEmpty().withMessage('Board name is required'),
  validate
], createBoard);

router.put('/:id', protect, updateBoard);
router.delete('/:id', protect, deleteBoard);

export default router;

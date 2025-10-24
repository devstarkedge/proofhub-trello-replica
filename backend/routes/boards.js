import express from 'express';
import { 
  getBoards, 
  getBoard, 
  createBoard, 
  updateBoard, 
  deleteBoard, 
  getBoardsByDepartment, 
  getWorkflowData 
} from '../controllers/boardController.js';
import { protect, authorize, checkBoardAccess } from '../middleware/authMiddleware.js';
import { boardValidation } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Get all boards for user
router.get('/', protect, getBoards);

// Get boards by department
router.get('/department/:departmentId', protect, getBoardsByDepartment);

// Get workflow data (department + project specific)
router.get('/workflow/:departmentId/:projectId', protect, getWorkflowData);

// Get single board
router.get('/:id', protect, checkBoardAccess, getBoard);

// Create board (Admin/Manager only)
router.post(
  '/', 
  protect, 
  authorize('admin', 'manager'), 
  upload.array('attachments', 10),
  boardValidation.create, 
  createBoard
);

// Update board
router.put('/:id', protect, checkBoardAccess, boardValidation.update, updateBoard);

// Delete board (Owner/Admin only)
router.delete('/:id', protect, checkBoardAccess, deleteBoard);

export default router;
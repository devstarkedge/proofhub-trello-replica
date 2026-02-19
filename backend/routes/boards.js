import express from 'express';
import { body } from 'express-validator';
import { 
  getBoards, 
  getBoard, 
  createBoard, 
  updateBoard, 
  deleteBoard, 
  getBoardsByDepartment, 
  getWorkflowData, 
  getWorkflowComplete,
  getProjectActivity,
  uploadCoverImage,
  removeCoverImage,
  restoreCoverImage,
  bulkDeleteBoards,
  undoBulkDeleteBoards
} from '../controllers/boardController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload, { uploadCoverImageMiddleware } from '../middleware/upload.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// Bulk operations (must be before /:id routes to avoid route conflict)
router.post('/bulk-delete', protect, authorize('admin', 'manager'), bulkDeleteBoards);
router.post('/undo-bulk-delete', protect, authorize('admin', 'manager'), undoBulkDeleteBoards);

router.get('/', protect, cacheMiddleware('boards', 120), getBoards);
router.get('/department/:departmentId', protect, cacheMiddleware('boards', 120), getBoardsByDepartment);
router.get('/workflow/:departmentId/:projectId', protect, cacheMiddleware('workflow', 180), getWorkflowData);
router.get('/:id/workflow-complete', protect, cacheMiddleware('workflow', 180), getWorkflowComplete); // Optimized single-call endpoint
router.get('/:id/activity', protect, cacheMiddleware('boards', 60), getProjectActivity);
router.get('/:id', protect, cacheMiddleware('boards', 120), getBoard);

router.post('/', protect, upload.array('attachments', 10), [
  body('name').trim().notEmpty().withMessage('Board name is required'),
  validate
], createBoard);

router.put('/:id', protect, updateBoard);
router.delete('/:id', protect, deleteBoard);

// Cover image routes
router.put('/:id/cover', protect, uploadCoverImageMiddleware.single('coverImage'), uploadCoverImage);
router.delete('/:id/cover', protect, removeCoverImage);
router.post('/:id/cover/restore/:versionIndex', protect, restoreCoverImage);

export default router;

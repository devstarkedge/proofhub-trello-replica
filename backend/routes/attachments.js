import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  uploadAttachment,
  uploadMultipleAttachments,
  getCardAttachments,
  getAttachmentsByContext,
  getAttachment,
  deleteAttachment,
  deleteMultipleAttachments,
  setAsCover,
  uploadFromPaste,
  uploadMiddleware
} from '../controllers/attachmentController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Upload routes
router.post('/upload', uploadMiddleware.single('file'), uploadAttachment);
router.post('/upload-multiple', uploadMiddleware.array('files', 10), uploadMultipleAttachments);
router.post('/paste', uploadFromPaste);

// Get routes
router.get('/card/:cardId', getCardAttachments);
router.get('/context/:contextType/:contextRef', getAttachmentsByContext);
router.get('/:id', getAttachment);

// Update routes
router.patch('/:id/set-cover', setAsCover);

// Delete routes
router.delete('/bulk', deleteMultipleAttachments);
router.delete('/:id', deleteAttachment);

export default router;

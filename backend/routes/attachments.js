import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  uploadAttachment,
  uploadMultipleAttachments,
  getCardAttachments,
  getBoardAttachments,
  getSubtaskAttachments,
  getNanoSubtaskAttachments,
  getAttachmentsByContext,
  getAttachment,
  deleteAttachment,
  deleteMultipleAttachments,
  setAsCover,
  uploadFromPaste,
  uploadFromGoogleDrive,
  uploadMiddleware
} from '../controllers/attachmentController.js';
import { restoreAttachment, permanentlyDeleteAttachment, bulkRestore, bulkPermanentDelete } from '../controllers/trashController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Upload routes
router.post('/upload', uploadMiddleware.single('file'), uploadAttachment);
router.post('/upload-multiple', uploadMiddleware.array('files', 10), uploadMultipleAttachments);
router.post('/paste', uploadFromPaste);
router.post('/upload-from-drive', uploadFromGoogleDrive);

// BULK ROUTES MUST COME BEFORE /:id ROUTES (order matters in Express)
// Delete routes
router.delete('/bulk', deleteMultipleAttachments);

// Trash bulk routes
router.post('/bulk/restore', bulkRestore);
router.delete('/bulk/permanent', bulkPermanentDelete);

// Get routes - specific entity routes first, then generic
router.get('/card/:cardId', getCardAttachments);
router.get('/board/:boardId', getBoardAttachments);
router.get('/subtask/:subtaskId', getSubtaskAttachments);
router.get('/nano/:nanoSubtaskId', getNanoSubtaskAttachments);
router.get('/context/:contextType/:contextRef', getAttachmentsByContext);
router.get('/:id', getAttachment);

// Update routes
router.patch('/:id/set-cover', setAsCover);

// Individual Delete routes
router.delete('/:id', deleteAttachment);

// Trash individual routes (AFTER :id routes since they're more specific)
router.post('/:id/restore', restoreAttachment);
router.delete('/:id/permanent', permanentlyDeleteAttachment);

export default router;


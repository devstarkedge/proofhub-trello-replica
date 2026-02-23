import express from 'express';
import { body } from 'express-validator';
import { getCards, getCardsByBoard, getCardsByDepartment, getCard, createCard, updateCard, moveCard, deleteCard, getCardActivity, archiveCard, restoreCard, getArchivedCards, addTimeEntry, updateTimeEntry, deleteTimeEntry, copyCard, crossMoveCard, undoMove, getCopyMoveDepartments, getCopyMoveProjects, getCopyMoveLists, getRecentDestinations } from '../controllers/cardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { managerOrAdmin } from '../middleware/rbacMiddleware.js';
import { validate } from '../middleware/validation.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.get('/list/:listId', protect, getCards);
router.get('/list/:listId/archived', protect, getArchivedCards);
router.get('/board/:boardId', protect, getCardsByBoard);
router.get('/department/:departmentId', protect, getCardsByDepartment);

// Copy/Move destination loaders
router.get('/copy-move/departments', protect, getCopyMoveDepartments);
router.get('/copy-move/projects/:departmentId', protect, getCopyMoveProjects);
router.get('/copy-move/lists/:boardId', protect, getCopyMoveLists);
router.get('/copy-move/recent', protect, getRecentDestinations);

router.get('/:id/activity', protect, getCardActivity);
router.get('/:id', protect, getCard);

router.post('/', protect, [
  body('title').trim().notEmpty().withMessage('Card title is required'),
  body('list').notEmpty().withMessage('List ID is required'),
  body('board').notEmpty().withMessage('Board ID is required'),
  validate
], createCard);

router.put('/:id', protect, updateCard);
router.put('/:id/move', protect, moveCard);
router.put('/:id/cross-move', protect, managerOrAdmin, crossMoveCard);
router.post('/:id/copy', protect, managerOrAdmin, copyCard);
router.post('/:id/undo-move', protect, undoMove);
router.put('/:id/archive', protect, archiveCard);
router.put('/:id/restore', protect, restoreCard);
router.delete('/:id', protect, deleteCard);

router.post('/:id/time-tracking', protect, addTimeEntry);
router.put('/:id/time-tracking/:entryId', protect, updateTimeEntry);
router.delete('/:id/time-tracking/:entryId', protect, deleteTimeEntry);

export default router;

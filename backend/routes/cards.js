import asyncHandler from '../middleware/asyncHandler.js';
import { enqueueCardMovements, movementReceipts } from '../services/cardMovementQueue.js';
import express from 'express';
import { body } from 'express-validator';
import { getCards, getCardsByBoard, getCardsByDepartment, getCard, createCard, updateCard, moveCard, deleteCard, getCardActivity, archiveCard, restoreCard, getArchivedCards, addTimeEntry, updateTimeEntry, deleteTimeEntry, copyCard, crossMoveCard, undoMove, getCopyMoveDepartments, getCopyMoveProjects, getCopyMoveLists, getRecentDestinations } from '../controllers/cardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { managerOrAdmin } from '../middleware/rbacMiddleware.js';
import { validate } from '../middleware/validation.js';
import '../middleware/upload.js';
import { listLoggedTimeReviews, reviewLoggedTime } from '../controllers/cardController.js';

const router = express.Router();

router.post('/movements', protect, asyncHandler(async(req,res)=>{res.status(202).json({success:true,data:await enqueueCardMovements(req,req.body.operations)});}));
router.get('/movements', protect, asyncHandler(async(req,res)=>{res.set('Cache-Control','no-store');res.json({success:true,data:await movementReceipts(req,String(req.query.ids||'').split(',').filter(Boolean))});}));
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
router.get('/:id/time-tracking/reviews', protect, listLoggedTimeReviews);
router.post('/:id/time-tracking/reviews/:entryId', protect, reviewLoggedTime);
router.put('/:id/time-tracking/:entryId', protect, updateTimeEntry);
router.delete('/:id/time-tracking/:entryId', protect, deleteTimeEntry);

export default router;

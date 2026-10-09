import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import { createAdjustment } from './leaveAdjustment.controller.js';

const router = express.Router();
router.use(protect);

router.post(
  '/',
  requireResourcePermission('leave', 'adjust_balance'),
  [
    body('userId').isMongoId(),
    body('leaveTypeId').isMongoId(),
    body('amount').optional().isNumeric(),
    body('count').optional().isNumeric(),
    body('operation').optional().isIn(['CREDIT', 'DEBIT']),
    body('clientAdjustmentId').optional().isString().isLength({ min: 1, max: 100 }),
    body('reason').trim().notEmpty(),
    validate
  ],
  createAdjustment
);

export default router;

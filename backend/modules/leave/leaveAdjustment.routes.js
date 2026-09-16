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
    body('userId').notEmpty(),
    body('leaveTypeId').notEmpty(),
    body('amount').isNumeric(),
    body('reason').trim().notEmpty(),
    validate
  ],
  createAdjustment
);

export default router;

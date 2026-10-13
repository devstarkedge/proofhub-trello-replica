import express from 'express';
import { body, query } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { hasResourceAction } from '../permissions/permissionEngine.js';
import { validate } from '../../middleware/validation.js';
import { createAdjustment, getAdjustments } from './leaveAdjustment.controller.js';

const router = express.Router();
router.use(protect);

const canViewAdjustments = async (req, res, next) => {
  try {
    const [canAdjust, canViewReports, canViewPolicy] = await Promise.all([
      hasResourceAction(req.user, 'leave', 'adjust_balance'),
      hasResourceAction(req.user, 'leave', 'view_reports'),
      hasResourceAction(req.user, 'leave', 'view_policy')
    ]);
    if (!canAdjust && !canViewReports && !canViewPolicy) {
      return res.status(403).json({
        success: false,
        message: 'Missing permission: leave.adjust_balance, leave.view_reports, or leave.view_policy'
      });
    }
    next();
  } catch (error) {
    console.error('canViewAdjustments error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify permission' });
  }
};

router.get(
  '/',
  canViewAdjustments,
  [
    query('userId').optional().isMongoId(),
    query('leaveTypeId').optional().isMongoId(),
    query('operation').optional().isIn(['CREDIT', 'DEBIT', 'ALL']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate
  ],
  getAdjustments
);

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

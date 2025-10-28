import express from 'express';
import { body } from 'express-validator';
import { getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment, addMemberToDepartment, removeMemberFromDepartment, unassignUserFromDepartment } from '../controllers/departmentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/', getDepartments);
router.get('/:id', protect, getDepartment);

router.post('/', protect, authorize('admin'), [
  body('name').trim().notEmpty().withMessage('Department name is required'),
  validate
], createDepartment);

router.put('/:id', protect, authorize('admin', 'manager'), updateDepartment);
router.delete('/:id', protect, authorize('admin', 'manager'), deleteDepartment);

// Member management routes
router.post('/:id/members', protect, authorize('admin', 'manager'), addMemberToDepartment);
router.delete('/:id/members/:userId', protect, authorize('admin', 'manager'), removeMemberFromDepartment);

// User unassign route
router.put('/users/:id/unassign', protect, authorize('admin', 'manager'), unassignUserFromDepartment);

export default router;

import express from 'express';
import { body } from 'express-validator';
import { getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment } from '../controllers/departmentController.js';
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

export default router;

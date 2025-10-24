import express from 'express';
import { 
  getDepartments, 
  getDepartment, 
  createDepartment, 
  updateDepartment, 
  deleteDepartment,
  addMemberToDepartment,
  removeMemberFromDepartment
} from '../controllers/departmentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { departmentValidation } from '../middleware/validation.js';

const router = express.Router();

// Get all departments (all authenticated users can view)
router.get('/', protect, getDepartments);

// Get single department
router.get('/:id', protect, getDepartment);

// Create department (Admin only)
router.post(
  '/', 
  protect, 
  authorize('admin'), 
  departmentValidation.create, 
  createDepartment
);

// Update department (Admin/Manager)
router.put(
  '/:id', 
  protect, 
  authorize('admin', 'manager'), 
  departmentValidation.update, 
  updateDepartment
);

// Delete department (Admin/Manager)
router.delete('/:id', protect, authorize('admin', 'manager'), deleteDepartment);

// Add member to department (Admin/Manager)
router.post('/:id/members', protect, authorize('admin', 'manager'), addMemberToDepartment);

// Remove member from department (Admin/Manager)
router.delete('/:id/members/:userId', protect, authorize('admin', 'manager'), removeMemberFromDepartment);

export default router;
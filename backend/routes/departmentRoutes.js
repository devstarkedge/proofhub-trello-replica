import express from 'express';
import { body } from 'express-validator';
import { getDepartments, getPublicDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment, addMemberToDepartment, removeMemberFromDepartment, getMembersWithAssignments, getProjectsWithMemberAssignments, unassignUserFromDepartment, bulkAssignUsersToDepartment, bulkUnassignUsersFromDepartment, getDepartmentsWithAssignments, getUserDepartmentFilterOptions, getDepartmentStats } from '../controllers/departmentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/public', getPublicDepartments); // Public route must be before protected routes (or distinct)
router.get('/', protect, getDepartments);
router.get('/with-assignments', protect, getDepartmentsWithAssignments);
router.get('/filter-options', protect, getUserDepartmentFilterOptions);
router.get('/stats/summary', protect, getDepartmentStats);
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

// Get members with assignments for filtering
router.get('/:id/members-with-assignments', protect, getMembersWithAssignments);

// Get projects where a member has assignments
router.get('/:id/projects-with-member/:memberId', protect, getProjectsWithMemberAssignments);

// User unassign route
router.put('/:deptId/users/:userId/unassign', protect, authorize('admin', 'manager'), unassignUserFromDepartment);

// Bulk operations routes
router.post('/:id/bulk-assign', protect, authorize('admin', 'manager'), [
  body('userIds').isArray({ min: 1 }).withMessage('User IDs array is required'),
  body('userIds.*').isMongoId().withMessage('Valid user ID required'),
  validate
], bulkAssignUsersToDepartment);

router.post('/:id/bulk-unassign', protect, authorize('admin', 'manager'), [
  body('userIds').isArray({ min: 1 }).withMessage('User IDs array is required'),
  body('userIds.*').isMongoId().withMessage('Valid user ID required'),
  validate
], bulkUnassignUsersFromDepartment);

export default router;

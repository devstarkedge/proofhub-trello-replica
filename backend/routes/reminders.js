import express from 'express';
import { body, query } from 'express-validator';
import {
  createReminder,
  getProjectReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  completeReminder,
  getDashboardStats,
  getCalendarReminders,
  getAllReminders,
  sendReminderNow,
  getProjectReminderStats,
  cancelReminder,
  syncClientFromProject
} from '../controllers/reminderController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication and admin/manager role
router.use(protect);
router.use(authorize('admin', 'manager'));

// Dashboard and stats routes
router.get('/dashboard/stats', getDashboardStats);
router.get('/calendar', [
  query('startDate').notEmpty().withMessage('Start date is required'),
  query('endDate').notEmpty().withMessage('End date is required'),
  validate
], getCalendarReminders);

// Main CRUD routes
router.route('/')
  .get(getAllReminders)
  .post([
    body('projectId').notEmpty().withMessage('Project ID is required'),
    body('scheduledDate').notEmpty().withMessage('Scheduled date is required'),
    validate
  ], createReminder);

// Project-specific reminders
router.get('/project/:projectId', getProjectReminders);
router.get('/project/:projectId/stats', getProjectReminderStats);

// Single reminder operations
router.route('/:id')
  .get(getReminder)
  .put([
    body('scheduledDate').optional().isISO8601().withMessage('Invalid date format'),
    validate
  ], updateReminder)
  .delete(deleteReminder);

// Reminder actions
router.post('/:id/complete', completeReminder);
router.post('/:id/send', sendReminderNow);
router.post('/:id/cancel', cancelReminder);
router.post('/:id/sync-client', syncClientFromProject);

export default router;

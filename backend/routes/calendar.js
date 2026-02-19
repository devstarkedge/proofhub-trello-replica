import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getCalendarTasks,
  createTaskFromCalendar,
  updateTaskDates,
  getProjectsForDepartment,
  getListsForProject
} from '../controllers/calendarController.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// All calendar routes require authentication
router.use(protect);

// Calendar tasks
router.get('/tasks', cacheMiddleware('calendar', 120), getCalendarTasks);
router.post('/tasks', createTaskFromCalendar);
router.patch('/tasks/:id/dates', updateTaskDates);

// Dropdown data for task creation
router.get('/projects/:departmentId', cacheMiddleware('calendar', 300), getProjectsForDepartment);
router.get('/lists/:projectId', cacheMiddleware('calendar', 300), getListsForProject);

export default router;

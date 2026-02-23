import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getCalendarTasks,
  createTaskFromCalendar,
  updateTaskDates,
  getProjectsForDepartment,
  getListsForProject
} from '../controllers/calendarController.js';

const router = express.Router();

// All calendar routes require authentication
router.use(protect);

// Calendar tasks
router.get('/tasks', getCalendarTasks);
router.post('/tasks', createTaskFromCalendar);
router.patch('/tasks/:id/dates', updateTaskDates);

// Dropdown data for task creation
router.get('/projects/:departmentId', getProjectsForDepartment);
router.get('/lists/:projectId', getListsForProject);

export default router;

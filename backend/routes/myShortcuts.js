import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  getMyDashboardSummary,
  getMyActivities,
  getMyTasksGrouped,
  getMyAnnouncements,
  getMyProjects
} from '../controllers/myShortcutsController.js';

const router = express.Router();

// All routes are protected and user-scoped
router.use(protect);

// Dashboard summary (batched: task count, time, activity count, etc.)
router.get('/dashboard', getMyDashboardSummary);

// User's activities with pagination and filtering
router.get('/activities', getMyActivities);

// User's tasks grouped by project
router.get('/tasks', getMyTasksGrouped);

// User's announcements
router.get('/announcements', getMyAnnouncements);

// User's assigned projects
router.get('/projects', getMyProjects);

export default router;

import express from 'express';
import { getAnalyticsDashboard, getAnalyticsTasks, getEmployeeAnalyticsTasks, getUserAnalytics, getProjectsAnalytics, getDepartmentAnalytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';
import { getAnalyticsReportSchedules, postAnalyticsReportSchedule, removeAnalyticsReportSchedule } from '../controllers/analyticsReportController.js';

const router = express.Router();

router.get('/dashboard', protect, getAnalyticsDashboard);
router.get('/tasks', protect, getAnalyticsTasks);
router.get('/employees/:employeeId/tasks', protect, getEmployeeAnalyticsTasks);
router.get('/reports/schedules', protect, getAnalyticsReportSchedules);
router.post('/reports/schedules', protect, postAnalyticsReportSchedule);
router.delete('/reports/schedules/:id', protect, removeAnalyticsReportSchedule);
router.get('/user/:userId', protect, getUserAnalytics);
router.get('/projects/:departmentId', protect, getProjectsAnalytics);
router.get('/department/:departmentId', protect, getDepartmentAnalytics);

export default router;


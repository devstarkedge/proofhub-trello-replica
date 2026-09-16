import express from 'express';
import { body } from 'express-validator';
import { protect } from '../../middleware/authMiddleware.js';
import { requireResourcePermission } from '../../middleware/requireAccessControl.js';
import { validate } from '../../middleware/validation.js';
import * as controller from './leaveCalendar.controller.js';

const router = express.Router();
router.use(protect);

// Reading the working calendar/holiday list is needed by every employee's
// own request form (to grey out non-working days) — not gated behind the
// administrative view_policy permission the way policy CRUD is.
router.get('/work-calendars', controller.listWorkCalendars);
router.post(
  '/work-calendars',
  requireResourcePermission('leave', 'manage_calendar'),
  [body('scope').isIn(['workspace', 'department']), body('effectiveFrom').notEmpty(), validate],
  controller.upsertWorkCalendar
);

router.get('/holidays', controller.listHolidays);
router.post(
  '/holidays',
  requireResourcePermission('leave', 'manage_calendar'),
  [body('date').notEmpty(), body('name').trim().notEmpty(), validate],
  controller.createHoliday
);
router.delete('/holidays/:holidayId', requireResourcePermission('leave', 'manage_calendar'), controller.deleteHoliday);

export default router;

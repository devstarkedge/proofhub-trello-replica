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

// Work Calendar Engine — base pattern + recurring rules + date overrides,
// read/saved/previewed as one atomic unit. Reads open to any workspace
// member (same self-service need as /work-calendars above); writes and
// the dry-run preview both require manage_calendar, since preview reveals
// nothing beyond what the requester is already about to save.
router.get('/work-calendar/config', controller.getWorkCalendarConfig);
router.post(
  '/work-calendar/config',
  requireResourcePermission('leave', 'manage_calendar'),
  [
    body('weeklyPattern').isArray({ min: 7, max: 7 }),
    body('recurringRules').optional().isArray(),
    body('dateOverrides').optional().isArray(),
    validate
  ],
  controller.saveWorkCalendarConfig
);
router.post(
  '/work-calendar/preview',
  requireResourcePermission('leave', 'manage_calendar'),
  [
    body('year').isInt({ min: 2000, max: 2200 }),
    body('month').isInt({ min: 1, max: 12 }),
    body('weeklyPattern').isArray({ min: 7, max: 7 }),
    validate
  ],
  controller.previewWorkCalendarConfig
);

export default router;

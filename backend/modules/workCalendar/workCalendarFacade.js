/**
 * The shared, workspace-neutral Work Calendar facade — the single source
 * of truth for "is this a working day?" that Attendance, Teams
 * productivity, and any future module should import, instead of each
 * reimplementing weekday/weekend logic or reaching into the Leave module
 * directly.
 *
 * This is a thin re-export, not a new implementation: the real resolver
 * (base weekly pattern + recurring nth-weekday rules + date overrides +
 * holidays, all workspace-timezone-aware) lives in
 * ../leave/workCalendarResolver.service.js and ../leave/leaveCalendar.service.js,
 * already built and tested. Work Calendar is administratively owned by
 * the Leave settings UI today (that's where Admin/HR configure it), but
 * the *resolution* logic is a workspace-wide business calendar every
 * module needs — moving the implementation would be a large, risky
 * refactor for a folder-naming preference alone, so this facade exposes
 * it under a neutral path instead. If Work Calendar administration ever
 * moves out from under Leave, only this file's re-export targets change —
 * no consumer of the facade needs to know.
 */
export {
  resolveWorkspaceDay,
  getWorkingDays,
  countWorkingDays,
  isWorkspaceWorkingDay,
  getExpectedMinutesForRange,
  getExpectedMinutesByUser
} from '../leave/workCalendarResolver.service.js';

export { classifyDate, classifyDateWithContext, buildCalendarContext } from '../leave/leaveCalendar.service.js';

/**
 * SalesTab Watch Alert — shared configuration constants.
 *
 * Centralized so frequency->schedule math and delivery-sweep tuning aren't
 * scattered as magic numbers across the alert/delivery service files.
 */

// UTC hour the "Daily summary" frequency delivers at. No per-user/workspace
// timezone field exists anywhere in the core (non-Slack) notification
// system — this mirrors AnalyticsReportSchedule's own default `hourUtc`
// convention (explicit UTC hour, not timezone-aware) rather than inventing
// a new, inconsistent timezone strategy just for Sales watch tabs.
export const DAILY_SUMMARY_HOUR_UTC = 8;

// How many pending SalesTabAlertEvent docs the delivery sweep pulls per
// iteration, and how often the sweep itself runs.
export const DELIVERY_SWEEP_BATCH_SIZE = 200;
export const DELIVERY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Bounded retry: after this many failed delivery attempts, an event is
// marked terminally `skipped` (lastError populated) instead of retried
// forever.
export const MAX_DELIVERY_RETRIES = 5;

/**
 * Computes when a newly-detected alert should be delivered, given the
 * owning tab's CURRENT alertFrequency. 'instant' returns `now` (delivery
 * is attempted synchronously right after detection; the periodic sweep
 * acts as a safety-net retry if that synchronous attempt fails).
 */
export function computeScheduledFor(frequency, now = new Date()) {
  const next = new Date(now);
  switch (frequency) {
    case '15min': {
      const bumped = Math.ceil((next.getUTCMinutes() + 1) / 15) * 15;
      next.setUTCMinutes(bumped, 0, 0);
      return next;
    }
    case 'hourly':
      next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
      return next;
    case 'daily': {
      next.setUTCHours(DAILY_SUMMARY_HOUR_UTC, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    case 'instant':
    default:
      return now;
  }
}

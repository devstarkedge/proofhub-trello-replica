// Saved report timestamps already use the workspace's local time. Extract the
// clock without converting it through the browser or server's timezone.
export function formatTrackingReportTime(value, fallback = 'Not recorded') {
  const time = typeof value === 'string' && /^(?:\d{4}-\d{2}-\d{2}[ T])?([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!time) return fallback;
  const hour = Number(time[1]);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${time[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

export const TRACKING_REPORT_DURATION_FORMAT = '[h]"h "m"m"';

export function formatTrackingReportDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return 'Not recorded';
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

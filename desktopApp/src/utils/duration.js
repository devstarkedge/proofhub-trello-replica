// Presentation only. API payloads and domain calculations remain in minutes.
export function minutesToHours(minutes) {
  return minutes === '' || minutes == null ? '' : Number(minutes) / 60;
}

export function formatTrackingClock(seconds) {
  const value = Math.floor(Math.max(0, seconds || 0));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
}

export function formatHours(minutes) {
  if (minutes == null || minutes === '' || !Number.isFinite(Number(minutes))) return '—';
  const totalMinutes = Math.round(Number(minutes));
  const sign = totalMinutes < 0 ? '-' : '';
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  if (!hours && !mins) return '0h';
  if (!hours) return `${sign}${mins}m`;
  if (!mins) return `${sign}${hours}h`;
  return `${sign}${hours}h ${mins}m`;
}

export function hoursToMinutes(hours, { min = 0, max = 1440 } = {}) {
  const value = typeof hours === 'string' && hours.trim() === '' ? NaN : Number(hours);
  const minutes = value * 60;
  if (!Number.isFinite(minutes) || Math.abs(minutes - Math.round(minutes)) > 1e-8 || minutes < min || minutes > max) {
    throw new Error(`Enter hours equivalent to whole minutes, between ${min / 60} and ${max / 60} hours`);
  }
  return Math.round(minutes);
}

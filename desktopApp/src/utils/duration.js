// Presentation only. API payloads and domain calculations remain in minutes.
export function minutesToHours(minutes) {
  return minutes === '' || minutes == null ? '' : Number(minutes) / 60;
}

export function formatHours(minutes) {
  if (minutes == null || minutes === '' || !Number.isFinite(Number(minutes))) return '—';
  const hours = Number(minutes) / 60;
  const value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(hours);
  return `${value} ${hours === 1 ? 'hour' : 'hours'}`;
}

export function hoursToMinutes(hours, { min = 0, max = 1440 } = {}) {
  const value = typeof hours === 'string' && hours.trim() === '' ? NaN : Number(hours);
  const minutes = value * 60;
  if (!Number.isFinite(minutes) || Math.abs(minutes - Math.round(minutes)) > 1e-8 || minutes < min || minutes > max) {
    throw new Error(`Enter hours equivalent to whole minutes, between ${min / 60} and ${max / 60} hours`);
  }
  return Math.round(minutes);
}

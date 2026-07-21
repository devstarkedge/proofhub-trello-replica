const analyticsDate = (value) => {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T00:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatAnalyticsDate = (value, { weekday = true } = {}) => {
  const date = analyticsDate(value);
  if (!date) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatAnalyticsDateTime = (value) => {
  const date = analyticsDate(value);
  if (!date) return 'Date and time unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
};

export const formatAnalyticsHours = (value) => {
  const numericHours = Number(value);
  if (!Number.isFinite(numericHours)) return '0h';
  const totalMinutes = Math.round(Math.abs(numericHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const sign = numericHours < 0 ? '-' : '';
  if (!hours && !minutes) return '0h';
  if (!hours) return `${sign}${minutes}m`;
  return `${sign}${hours.toLocaleString('en-IN')}h${minutes ? ` ${minutes}m` : ''}`;
};

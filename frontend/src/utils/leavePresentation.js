export function formatFriendlyDate(dateInput, timezone) {
  if (!dateInput) return '—';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone
  });
}

export function formatFriendlyDateTime(dateInput, timezone) {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '—';
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });
  return `${dateStr}, ${timeStr}`;
}

export function formatFriendlyDateRange(startKeyOrDate, endKeyOrDate, timezone) {
  if (!startKeyOrDate && !endKeyOrDate) return '—';
  const startFormatted = formatFriendlyDate(startKeyOrDate, timezone);
  const endFormatted = formatFriendlyDate(endKeyOrDate, timezone);
  if (startFormatted === endFormatted) return startFormatted;
  return `${startFormatted} – ${endFormatted}`;
}

export function formatFriendlyDuration(units, category) {
  if (units == null) return '—';
  if (category === 'SHORT_LEAVE') {
    return `${units} ${units === 1 ? 'short leave' : 'short leaves'}`;
  }
  return `${units} ${units === 1 ? 'day' : 'days'}`;
}

export const formatActivityQuantity = (activity) => activity.signedQuantity === null ? `${activity.quantity} (direction unavailable)` : `${activity.signedQuantity > 0 ? '+' : activity.signedQuantity < 0 ? '−' : ''}${activity.signedQuantity === 0 ? activity.quantity : Math.abs(activity.signedQuantity)}`;

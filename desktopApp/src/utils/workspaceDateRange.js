export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function workspaceDateKey(date = new Date(), timezone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (key) => parts.find((p) => p.type === key).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function periodDateRange(period, { now = new Date(), timezone = 'Asia/Kolkata', weekStartsOn = 0 } = {}) {
  const today = workspaceDateKey(now, timezone);
  const date = new Date(`${today}T00:00:00Z`);
  const year = date.getUTCFullYear(), month = date.getUTCMonth();
  const key = (value) => value.toISOString().slice(0, 10);
  if (period === 'week') {
    const offset = (date.getUTCDay() - weekStartsOn + 7) % 7;
    const start = new Date(Date.UTC(year, month, date.getUTCDate() - offset));
    return { startDate: key(start), endDate: key(new Date(start.getTime() + 6 * 86400000)) };
  }
  if (period === 'year') return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  return { startDate: key(new Date(Date.UTC(year, month, 1))), endDate: key(new Date(Date.UTC(year, month + 1, 0))) };
}

export function isValidDateRange(start, end) {
  const valid = (key) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key)) && new Date(key).toISOString().slice(0, 10) === key;
  return valid(start) && valid(end) && start <= end && (Date.parse(end) - Date.parse(start)) / 86400000 < 3660;
}

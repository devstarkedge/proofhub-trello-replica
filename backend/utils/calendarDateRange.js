import { ErrorResponse } from '../middleware/errorHandler.js';

export function validateDateRange(startDate, endDate, maxDays = 3660) {
  const valid = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
    && Number.isFinite(Date.parse(key)) && new Date(key).toISOString().slice(0, 10) === key;
  if (!valid(startDate) || !valid(endDate) || startDate > endDate
    || (Date.parse(endDate) - Date.parse(startDate)) / 86400000 >= maxDays) {
    throw new ErrorResponse(`Choose valid start and end dates in order, spanning at most ${maxDays} days`, 400);
  }
}

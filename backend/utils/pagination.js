import { ErrorResponse } from '../middleware/errorHandler.js';
export function boundedInteger(value, fallback, max = 100, min = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) throw new ErrorResponse('Invalid pagination value', 400);
  return Math.min(parsed, max);
}
export const pageNumber = value => boundedInteger(value, 1, 1000);

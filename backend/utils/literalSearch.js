import { ErrorResponse } from '../middleware/errorHandler.js';

export function literalSearch(input) {
  if (typeof input !== 'string' || input.length > 100) throw new ErrorResponse('Search must be at most 100 characters', 400);
  return new RegExp(input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

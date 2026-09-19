import { ErrorResponse } from '../../middleware/errorHandler.js';

/** ErrorResponse + a machine-readable `.code` (spec §75) the frontend maps to a friendly, non-leaking message. */
export function codedError(message, statusCode, code) {
  const error = new ErrorResponse(message, statusCode);
  error.code = code;
  return error;
}

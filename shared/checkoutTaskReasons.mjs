export const LOGGED_TIME_REASON_MAX_LENGTH = 500;

export function normalizeCheckoutTaskReason(value) {
  if (typeof value !== 'string') return null;
  const reason = value.trim();
  return reason && reason.length <= LOGGED_TIME_REASON_MAX_LENGTH ? reason : null;
}

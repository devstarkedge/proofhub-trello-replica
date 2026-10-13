export const LEAVE_CLIENT_ID_KEYS = { workspaceId: 1, requester: 1, clientRequestId: 1 };
export const LEAVE_CLIENT_ID_INDEX = 'leave_request_client_id_unique';
export const LEGACY_LEAVE_CLIENT_ID_INDEX = 'workspaceId_1_requester_1_clientRequestId_1';
export const LEAVE_CLIENT_ID_OPTIONS = {
  name: LEAVE_CLIENT_ID_INDEX,
  unique: true,
  partialFilterExpression: { clientRequestId: { $type: 'string' } }
};

export function normalizeLeaveClientId(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new TypeError('clientRequestId must be a nonblank string of at most 100 characters');
  }
  return value.trim();
}

export function isLeaveClientIdDuplicate(error) {
  if (error?.code !== 11000) return false;
  if (error.keyPattern) {
    const keys = Object.keys(error.keyPattern);
    return keys.length === 3 && Object.entries(LEAVE_CLIENT_ID_KEYS).every(([key, value]) => error.keyPattern[key] === value);
  }
  return [LEAVE_CLIENT_ID_INDEX, LEGACY_LEAVE_CLIENT_ID_INDEX].some((name) =>
    String(error.message).includes(`index: ${name} dup key`));
}

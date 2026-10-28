import { createHash, randomUUID } from 'node:crypto';
import { EMAIL_REGEX } from '../../../shared/projectClient.mjs';

export const REQUIRED_SCOPES = ['crm.objects.contacts.read', 'crm.objects.contacts.write'];
export const PROPERTIES = ['email', 'firstname', 'lastname', 'phone', 'technology', 'hubspot_owner_id'];
export const technologyIds = board => [...new Set((board.technologies || []).map(value => String(value?._id || value)))].sort();
export const sourceHash = board => digest({ ...payloadFor(board), technologies: technologyIds(board) });
export const RETRY_MS = 120_000;
export const MAX_ATTEMPTS = 4;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export const eligible = board => board?.projectType === 'Hired Client' && !board.isDeleted;
export function payloadFor(board) {
  const client = board?.clientDetails || {};
  const parts = String(client.clientName || '').trim().split(/\s+/).filter(Boolean);
  return {
    email: String(client.clientEmail || '').trim().toLowerCase(),
    firstname: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts.join(''),
    lastname: parts.length > 1 ? parts.at(-1) : '',
    phone: String(client.clientWhatsappNumber || '').trim(),
  };
}
export class SyncError extends Error {
  constructor(code, message, { permanent = false, status = 0, retryAfter = 0 } = {}) {
    super(message); Object.assign(this, { code, permanent, status, statusCode: status || 400, retryAfter });
  }
}
export function validatePayload(payload) {
  if (!payload.email || payload.email.length > 254 || !EMAIL_REGEX.test(payload.email)) {
    throw new SyncError('INVALID_IDENTITY', 'A valid client email is required.', { permanent: true });
  }
  if (payload.phone && !/^\+[1-9]\d{6,14}$/.test(payload.phone)) {
    throw new SyncError('INVALID_PHONE', 'Client phone must include a valid + country code.', { permanent: true });
  }
  if (payload.firstname.length > 255 || payload.lastname.length > 255) {
    throw new SyncError('INVALID_NAME', 'Client name exceeds the supported length.', { permanent: true });
  }
}
export function sourceState(board, previous = {}) {
  const payload = payloadFor(board);
  const hash = sourceHash(board);
  const isEligible = eligible(board);
  if (previous.version && previous.hash === hash && previous.eligible === isEligible) return previous;
  return {
    ...previous,
    clientKey: previous.clientKey || digest(payload), identityHash: digest(payload),
    version: randomUUID(), hash, emailHash: digest(payload.email), eligible: isEligible,
    status: isEligible ? 'pending' : 'not_eligible', attempts: 0,
    nextAttemptAt: new Date(), errorCode: '', error: '',
  };
}
export function retryState(attempts, now, retryAfter = 0) {
  return attempts >= MAX_ATTEMPTS
    ? { status: 'failed', nextAttemptAt: null }
    : { status: 'retrying', nextAttemptAt: new Date(Math.max(now + RETRY_MS, retryAfter)) };
}

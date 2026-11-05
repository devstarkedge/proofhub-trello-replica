import { getCheckoutPreview } from './attendanceApi';
import { sessionIdentity, isCurrentSession } from '../../../shared/sessionTransport.mjs';
import { registerResettable } from '../store/resetRegistry';

const previews = new Map(), maxAgeMs = 10000;
export function invalidateCheckoutPreviews(scope) {
  for (const [key, entry] of previews) if (!scope || entry.scope === scope) { entry.generation++; previews.delete(key); }
}
export function readCheckoutPreview(scope, attendanceSessionId, { force = false } = {}) {
  const identity = sessionIdentity(localStorage);
  if (scope !== `${identity.workspaceId}:${identity.actor}`) return Promise.reject(new DOMException('Session changed', 'AbortError'));
  const key = `${scope}:${attendanceSessionId}`;
  let entry = previews.get(key);
  if (entry && !isCurrentSession(entry.identity, localStorage)) { invalidateCheckoutPreviews(scope); entry = null; }
  if (!entry) {
    entry = { scope, identity, generation: 0, value: null, savedAt: 0, flight: null };
    previews.set(key, entry);
    while (previews.size > 4) { const oldest = previews.keys().next().value; previews.get(oldest).generation++; previews.delete(oldest); }
  }
  if (!force && entry.value && Date.now() - entry.savedAt < maxAgeMs && +new Date(entry.value.data.expiresAt) > Date.now()) return Promise.resolve(entry.value);
  if (entry.flight) return entry.flight;
  const generation = entry.generation;
  const flight = getCheckoutPreview({ silent: true }).then(result => {
    if (generation !== entry.generation || !isCurrentSession(identity, localStorage)) throw new DOMException('Session changed', 'AbortError');
    if (String(result.data.attendanceSessionId) === String(attendanceSessionId)) { entry.value = result; entry.savedAt = Date.now(); }
    return result;
  }).finally(() => { if (entry.flight === flight) entry.flight = null; });
  entry.flight = flight;
  return flight;
}
registerResettable(() => invalidateCheckoutPreviews());

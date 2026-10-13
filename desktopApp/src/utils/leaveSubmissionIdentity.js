const memory = new Map();

/** Keep only an opaque ID and payload digest, scoped to this user/workspace. */
export function createLeaveSubmissionIdentity({ key, storage, uuid = () => crypto.randomUUID(), digest = async (text) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
} }) {
  let pending = memory.get(key);
  if (!pending) {
    try { pending = JSON.parse(storage?.getItem(key) || 'null'); } catch { /* Storage can be disabled. */ }
    if (typeof pending?.clientRequestId !== 'string' || typeof pending?.fingerprint !== 'string') pending = null;
  }
  return {
    async forPayload(payload) {
      const short = payload.dayType === 'SHORT_LEAVE';
      const fingerprint = await digest(JSON.stringify({
        leaveTypeId: payload.leaveTypeId, startDate: payload.startDate, endDate: payload.endDate,
        dayType: payload.dayType, reason: (payload.reason || '').trim(),
        shortLeaveStartTime: short ? payload.shortLeaveStartTime : null,
        shortLeaveEndTime: short ? payload.shortLeaveEndTime : null,
        shortLeaveDurationMinutes: short ? Number(payload.shortLeaveDurationMinutes) : null
      }));
      if (!pending || pending.fingerprint !== fingerprint) {
        pending = { clientRequestId: uuid(), fingerprint };
        memory.set(key, pending);
        try { storage?.setItem(key, JSON.stringify(pending)); } catch { /* In-memory retries still work. */ }
      }
      return pending.clientRequestId;
    },
    complete(clientRequestId) {
      if (pending?.clientRequestId !== clientRequestId) return;
      pending = null; memory.delete(key);
      try { storage?.removeItem(key); } catch { /* Storage can be disabled. */ }
    }
  };
}

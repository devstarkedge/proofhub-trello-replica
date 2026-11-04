const REPAIR_INTERVAL_MS = 5 * 60 * 1000;

export function shouldRebuildReportingDirectory(state, now = Date.now()) {
  return !!state.dirty || !state.syncedAt || !(+new Date(state.nextDirectoryCheckAt || 0) > now);
}

export function reportingAccessClock(records, now = Date.now()) {
  let next = now + REPAIR_INTERVAL_MS;
  const expired = [], pending = [{ value: records, path: '' }], seen = new WeakSet();
  while (pending.length) {
    const { value, path } = pending.pop();
    if (!value || typeof value !== 'object' || value instanceof Date || seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}/${key}`;
      if (key === 'expiresAt' && child) {
        const expiry = +new Date(child);
        if (expiry > now) next = Math.min(next, expiry);
        else if (Number.isFinite(expiry)) expired.push(childPath);
      } else if (child && typeof child === 'object') pending.push({ value: child, path: childPath });
    }
  }
  return { nextCheckAt: new Date(next), expired: expired.sort() };
}

export const nextReportingDirectoryCheck = (records, now = Date.now()) => reportingAccessClock(records, now).nextCheckAt;

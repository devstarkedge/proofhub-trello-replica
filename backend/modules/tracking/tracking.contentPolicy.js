export const SCREENSHOT_AUTHORIZATION_MS = 5 * 60 * 1000;

export function screenshotContentPolicy(screenshot, { ifNoneMatch, credentialExpiresAt, now = Date.now() } = {}) {
  const etag = `"${screenshot.checksum}"`;
  const authorizedUntil = Math.min(now + SCREENSHOT_AUTHORIZATION_MS,
    screenshot.expiresAt ? +new Date(screenshot.expiresAt) : Infinity,
    Number.isFinite(credentialExpiresAt) ? credentialExpiresAt : Infinity);
  // GET permits weak comparison. Authorization must run before this helper.
  const notModified = String(ifNoneMatch || '').split(',').some(value => {
    const tag = value.trim().replace(/^W\//, '');
    return tag === etag || tag === '*';
  });
  return { etag, authorizedUntil, notModified };
}

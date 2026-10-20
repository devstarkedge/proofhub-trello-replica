import { screenshotKey } from './tracking.storage.js';

// Internal projection fields needed to verify both supported R2 key layouts.
// These fields are never spread into public screenshot responses.
export const SCREENSHOT_IDENTITY_SELECT = 'workspaceId user captureId storageProvider storageKey storageDateKey storageWorkspaceLabel storageDepartmentLabel storageUserLabel';

const text = value => typeof value === 'string' ? value : value?.toHexString?.() || '';

export function resolveScreenshotIdentity(record) {
  const fallback = text(record?._id);
  if (record?.storageProvider !== 'cloudflare-r2' || typeof record.storageKey !== 'string') return fallback;
  if (![record.workspaceId,record.user,record.interval].every(value => /^[a-f\d]{24}$/i.test(text(value))) ||
      typeof record.displayId !== 'string' || !/^[\w-]{1,80}$/.test(record.displayId)) return fallback;
  try {
    // Use the storage writer's own validation, including ownership path, date,
    // timestamp, capture interval and monitor. Never guess from an arbitrary
    // ObjectId-looking substring, an unknown layout, or another capture's key.
    const canonicalKey = screenshotKey({ ...record, variant: undefined });
    const thumbnailKey = screenshotKey({ ...record, variant: 'thumbnail' });
    if (record.storageKey !== canonicalKey && record.storageKey !== thumbnailKey) return fallback;
    const filename = record.storageKey.slice(record.storageKey.lastIndexOf('/') + 1);
    const match = /^(?:\d{8}T\d{9}Z-)?([a-f\d]{24})-/i.exec(filename);
    if (!match) return fallback;
    const identity = match[1];
    // A captureId is authoritative only when it is exactly the filename ID.
    // Today's UUID captureId is deliberately not substituted for the interval ID.
    return text(record.captureId) === identity ? text(record.captureId) : identity;
  } catch {
    return fallback;
  }
}

export function timelineScreenshot(record) {
  return { _id: record._id, interval: record.interval, displayId: record.displayId,
    capturedAt: record.capturedAt, width: record.width, height: record.height,
    blurred: record.blurred, uploadStatus: record.uploadStatus, status: record.status,
    screenshotIdentity: resolveScreenshotIdentity(record) };
}

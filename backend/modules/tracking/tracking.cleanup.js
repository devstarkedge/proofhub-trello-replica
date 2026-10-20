import { createHash } from 'node:crypto';

export function cleanupCandidate(record) {
  if (!record || record.status !== 'READY' || record.storageProvider !== 'cloudflare-r2' ||
      !record.thumbnail?.storageKey || record.thumbnail.storageKey === record.storageKey ||
      record.expiresAt && +new Date(record.expiresAt) <= Date.now()) return null;
  const fields = ['workspaceId','user','interval','displayId','capturedAt','storageBucket','storageKey',
    'checksum','contentMd5','bytes','width','height','thumbnail','expiresAt'];
  const snapshot = Object.fromEntries(fields.map(field => [field, record[field]]));
  return { screenshotId: String(record._id), workspaceId: String(record.workspaceId),
    canonicalKey: record.storageKey, thumbnailKey: record.thumbnail.storageKey,
    fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}

export async function inspectCleanupCandidate(record, { verifyCanonical, verifyThumbnail }) {
  const candidate = cleanupCandidate(record);
  if (!candidate) return null;
  // These verifiers check deterministic keys, capture/owner/monitor metadata,
  // actual object checksums, dimensions, and complete WebP decoding.
  await verifyCanonical(record);
  await verifyThumbnail(record);
  return candidate;
}

export async function executeCleanupCandidate(candidate, { find, verifyCanonical, referenced, removeThumbnail, unsetThumbnail }) {
  const record = await find(candidate.screenshotId);
  if (record && !record.thumbnail?.storageKey) return 'already-clean';
  const current = cleanupCandidate(record);
  if (!current || JSON.stringify(current) !== JSON.stringify(candidate)) return 'changed';
  if (await referenced(candidate.thumbnailKey)) return 'referenced';
  // Reverify immediately before destruction; never trust a previous dry run.
  await verifyCanonical(record);
  await removeThumbnail(record); // R2 DeleteObject is idempotent after interruption.
  await unsetThumbnail(record);
  return 'cleaned';
}

import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryMigrationRequest } from './migrationErrors.js';

export function parseOwnedCloudinaryURL(value, cloudName = cloudinary.config().cloud_name) {
  let url; try { url = new URL(value); } catch { return null; }
  if (url.hostname !== 'res.cloudinary.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== cloudName || !['image', 'video', 'raw'].includes(parts[1])) throw new Error('Legacy media belongs to an unrecognized cloud account; reconcile its ownership first.');
  const version = parts.findIndex((part, index) => index > 2 && /^v\d+$/.test(part));
  if (version < 0) throw new Error('Legacy media has no unambiguous versioned storage path; provide a reviewed mapping first.');
  const publicPath = decodeURIComponent(parts.slice(version + 1).join('/'));
  const format = publicPath.split('.').pop();
  return { publicId: parts[1] === 'raw' ? publicPath : publicPath.replace(/\.[^.\/]+$/, ''), resourceType: parts[1], deliveryType: parts[2], format };
}

export function resolveStorageMetadata(asset, cloud) {
  const patch = {}; let parsed;
  for (const value of [asset.url, asset.secureUrl].filter(Boolean)) {
    const candidate = parseOwnedCloudinaryURL(value, cloud.config().cloud_name);
    if (!candidate) continue;
    if (parsed && (parsed.publicId !== candidate.publicId || parsed.resourceType !== candidate.resourceType)) throw new Error('Storage URLs identify different cloud assets');
    parsed = candidate;
  }
  if (!asset.publicId) {
    if (!parsed?.publicId) throw new Error('Storage publicId is missing and no owned, versioned Cloudinary URL can recover it');
    patch.publicId = parsed.publicId;
  } else if (parsed && asset.publicId !== parsed.publicId) throw new Error('Storage publicId conflicts with its versioned Cloudinary URL');
  if (parsed && asset.resourceType && asset.resourceType !== 'auto' && asset.resourceType !== parsed.resourceType) throw new Error('Storage resource type conflicts with its versioned Cloudinary URL');
  if (!asset.resourceType || asset.resourceType === 'auto') {
    if (!parsed?.resourceType) throw new Error('Storage resource type is unknown; a reviewed image/video/raw mapping is required');
    patch.resourceType = parsed.resourceType;
  }
  if (!asset.deliveryType && parsed) patch.deliveryType = parsed.deliveryType;
  if (!asset.format && parsed) patch.format = parsed.format;
  const resolved = { ...asset, ...patch };
  if (!['image', 'video', 'raw'].includes(resolved.resourceType) || !['upload', 'private', 'authenticated'].includes(resolved.deliveryType || 'upload')) throw new Error('Unsupported cloud resource or delivery type; review the storage mapping');
  return { resolved, patch, ownedURL: Boolean(parsed) };
}

const missing = error => Number(error?.http_code) === 404;
/** Preserve bytes while disabling public delivery. A missing asset is accepted
 * only for quarantine after both source and authenticated storage return 404. */
export async function secureQuarantinedStorage(asset, cloud) {
  const resource_type = asset.resourceType, type = asset.deliveryType || 'upload';
  if (type !== 'authenticated') {
    try {
      await cloudinaryMigrationRequest('convert to authenticated delivery', () => cloud.uploader.rename(asset.publicId, asset.publicId, { resource_type, type, to_type: 'authenticated', invalidate: true, overwrite: false, timeout: 45000 }));
      return 'secured';
    } catch (error) { if (!missing(error)) throw error; }
  }
  try { await cloudinaryMigrationRequest('check authenticated storage', () => cloud.api.resource(asset.publicId, { resource_type, type: 'authenticated', timeout: 45000 })); return 'secured'; }
  catch (error) { if (!missing(error)) throw error; }
  if (type !== 'authenticated') {
    try { await cloudinaryMigrationRequest('check original storage', () => cloud.api.resource(asset.publicId, { resource_type, type, timeout: 45000 })); }
    catch (error) { if (missing(error)) return 'missing_in_storage'; throw error; }
    throw new Error('Original cloud file still exists but conversion did not finish; review storage before retrying');
  }
  return 'missing_in_storage';
}

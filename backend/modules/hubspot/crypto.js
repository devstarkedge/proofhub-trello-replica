import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { SyncError } from './domain.js';

// Keys are supplied by the deployment secret manager, NEVER by MongoDB.
function keyFor(version) {
  let keys;
  try { keys = JSON.parse(process.env.HUBSPOT_ENCRYPTION_KEYS || '{}'); } catch { /* safe error below */ }
  const encoded = keys?.[version];
  const key = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : null;
  if (!key || key.length !== 32 || key.toString('base64') !== encoded) {
    throw new SyncError('ENCRYPTION_UNAVAILABLE', 'Integration encryption is not configured correctly.', { permanent: true });
  }
  return key;
}
export function encryptionReady() {
  const version = process.env.HUBSPOT_ENCRYPTION_KEY_VERSION;
  if (!version || !/^[a-zA-Z0-9_-]{1,64}$/.test(version)) throw new SyncError('ENCRYPTION_UNAVAILABLE', 'Integration encryption is not configured correctly.', { permanent: true });
  keyFor(version); return version;
}
const aad = (workspaceId, portalId, keyVersion) => Buffer.from(`flowtask:hubspot:${workspaceId}:${portalId}:${keyVersion}`);
export function encryptCredential(secret, workspaceId, portalId) {
  const keyVersion = encryptionReady();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(keyVersion), iv);
  cipher.setAAD(aad(workspaceId, portalId, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { keyVersion, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
export function decryptCredential(envelope, workspaceId, portalId) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(envelope.keyVersion), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(aad(workspaceId, portalId, envelope.keyVersion));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new SyncError('DECRYPTION_FAILED', 'Integration credential could not be decrypted.', { permanent: true });
  }
}

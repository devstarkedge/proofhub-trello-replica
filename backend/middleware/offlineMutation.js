import { createHash } from 'node:crypto';
import OfflineMutationReceipt from '../models/OfflineMutationReceipt.js';
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

/** At-most-once offline replay. A crashed/pending request requires review,
 * rather than risking repeating a mutation whose commit was not observed. */
export async function guardOfflineMutation(req, res, next) {
  const mutationId = req.headers['x-offline-mutation-id'];
  if (!mutationId) return next();
  if (!/^[a-f0-9-]{36}$/i.test(mutationId) || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return res.status(400).json({ success: false, message: 'Invalid offline operation' });
  const key = hash(JSON.stringify([req.workspaceId, String(req.user._id || req.user.id), mutationId]));
  const fingerprint = hash(JSON.stringify([req.method, req.originalUrl, canonical(req.body)]));
  try {
    await OfflineMutationReceipt.create({ _id: key, fingerprint, state: 'pending', expiresAt: new Date(Date.now() + 30 * 86400000) });
  } catch (error) {
    if (error.code !== 11000) return next(error);
    const receipt = await OfflineMutationReceipt.findById(key).lean();
    if (receipt?.fingerprint !== fingerprint) return res.status(409).json({ success: false, message: 'Offline operation does not match its original request' });
    // Never cache domain payloads that might disclose a now-revoked project.
    if (receipt.state === 'completed') return res.status(208).json({ success: true, alreadyApplied: true });
    return res.status(409).json({ success: false, message: 'This offline operation needs review before retrying' });
  }
  res.once('finish', () => {
    OfflineMutationReceipt.updateOne({ _id: key, state: 'pending' }, { $set: { state: res.statusCode < 400 ? 'completed' : 'rejected', status: res.statusCode } }).catch(() => {});
  });
  next();
}

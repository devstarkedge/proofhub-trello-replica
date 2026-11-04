import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import RefreshSession from '../models/RefreshSession.js';
import User from '../models/User.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
const retryWindowMs = 60000;
const validRequestId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
// Reconstruct the same replacement only with BOTH the old credential and the
// cryptographically random attempt id. Existing tokenHash index serves retries.
const retryToken = (rawToken, requestId) => crypto.createHmac('sha384', process.env.JWT_SECRET)
  .update(JSON.stringify(['flowtask-refresh-v1', rawToken, requestId])).digest('base64url');
function rejected(message, code) {
  const error = new ErrorResponse(message, 401);
  error.code = code;
  return error;
}
const accessToken = user => jwt.sign({ id: user._id, tokenVersion: user.tokenVersion || 0, type: 'access' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' });

export async function issueSession(user) {
  const refreshToken = newRefreshToken();
  await RefreshSession.create({ user: user._id, tokenHash: hash(refreshToken), tokenVersion: user.tokenVersion || 0, expiresAt: new Date(Date.now() + 30 * 86400000) });
  return { token: accessToken(user), refreshToken };
}

export async function rotateSession(rawToken, requestId) {
  if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(rawToken)) throw rejected('Invalid refresh session', 'REFRESH_INVALID');
  if (requestId !== undefined && !validRequestId(requestId)) throw new ErrorResponse('Invalid refresh attempt', 400);
  const tokenHash = hash(rawToken);
  const refreshToken = requestId ? retryToken(rawToken, requestId) : newRefreshToken();
  const receiptFilter = requestId ? {
    tokenHash: hash(refreshToken), expiresAt: { $gt: new Date() },
    'rotation.previousTokenHash': tokenHash, 'rotation.requestHash': hash(requestId),
    'rotation.retryUntil': { $gt: new Date() }
  } : null;
  let session = await RefreshSession.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean();
  let recovering = false;
  if (!session && receiptFilter) {
    session = await RefreshSession.findOne(receiptFilter).lean();
    recovering = Boolean(session);
  }
  if (!session) throw rejected('Refresh session expired or already used', 'REFRESH_INVALID');
  const user = await User.findById(session.user);
  if (!user?.isActive || session.tokenVersion !== (user.tokenVersion || 0)) {
    await RefreshSession.deleteOne({ _id: session._id });
    throw rejected('Session invalidated', 'SESSION_REVOKED');
  }
  if (!recovering) {
    const rotation = requestId ? { previousTokenHash: tokenHash, requestHash: hash(requestId), retryUntil: new Date(Date.now() + retryWindowMs) } : null;
    const rotated = await RefreshSession.findOneAndUpdate({ _id: session._id, tokenHash, expiresAt: { $gt: new Date() } }, { $set: { tokenHash: hash(refreshToken), rotation } }, { new: true });
    // Concurrent retries with the SAME attempt id return the same credential.
    if (!rotated && !(receiptFilter && await RefreshSession.findOne(receiptFilter).lean())) throw rejected('Refresh session already used', 'REFRESH_INVALID');
  }
  return { token: accessToken(user), refreshToken };
}

export async function revokeSession(rawToken, requestId) {
  if (typeof rawToken === 'string' && rawToken.length <= 128) {
    await RefreshSession.deleteOne({ tokenHash: hash(rawToken) });
    // Explicit logout must also revoke a rotation whose response was lost.
    if (validRequestId(requestId)) await RefreshSession.deleteOne({ tokenHash: hash(retryToken(rawToken, requestId)), 'rotation.previousTokenHash': hash(rawToken), 'rotation.requestHash': hash(requestId) });
  }
}

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import RefreshSession from '../models/RefreshSession.js';
import User from '../models/User.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const newRefreshToken = () => crypto.randomBytes(48).toString('base64url');
const accessToken = user => jwt.sign({ id: user._id, tokenVersion: user.tokenVersion || 0, type: 'access' }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' });

export async function issueSession(user) {
  const refreshToken = newRefreshToken();
  await RefreshSession.create({ user: user._id, tokenHash: hash(refreshToken), tokenVersion: user.tokenVersion || 0, expiresAt: new Date(Date.now() + 30 * 86400000) });
  return { token: accessToken(user), refreshToken };
}

export async function rotateSession(rawToken) {
  if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(rawToken)) throw new ErrorResponse('Invalid refresh session', 401);
  const tokenHash = hash(rawToken);
  const session = await RefreshSession.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).lean();
  if (!session) throw new ErrorResponse('Refresh session expired or already used', 401);
  const user = await User.findById(session.user);
  if (!user?.isActive || session.tokenVersion !== (user.tokenVersion || 0)) {
    await RefreshSession.deleteOne({ _id: session._id });
    throw new ErrorResponse('Session invalidated', 401);
  }
  const refreshToken = newRefreshToken();
  const rotated = await RefreshSession.findOneAndUpdate({ _id: session._id, tokenHash, expiresAt: { $gt: new Date() } }, { $set: { tokenHash: hash(refreshToken) } }, { new: true });
  if (!rotated) throw new ErrorResponse('Refresh session already used', 401);
  return { token: accessToken(user), refreshToken };
}

export async function revokeSession(rawToken) {
  if (typeof rawToken === 'string' && rawToken.length <= 128) await RefreshSession.deleteOne({ tokenHash: hash(rawToken) });
}

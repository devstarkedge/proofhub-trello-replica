import crypto from 'node:crypto';
import User from '../models/User.js';
import { ErrorResponse } from '../middleware/errorHandler.js';
import { sendEmail } from '../utils/email.js';
import config from '../config/index.js';
import { invalidateAuthCache } from '../middleware/authMiddleware.js';

const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestEmailChange(userId, proposedEmail) {
  const email = String(proposedEmail || '').trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 254) throw new ErrorResponse('Invalid email address', 400);
  const user = await User.findById(userId);
  if (!user) throw new ErrorResponse('Account not found', 404);
  if (user.email.toLowerCase() === email) return false;
  if (await User.exists({ email, _id: { $ne: userId } })) throw new ErrorResponse('Email address unavailable', 409);
  const token = crypto.randomBytes(32).toString('hex');
  const oldEmail = user.email;
  user.pendingEmailChange = { email, tokenHash: digest(token), expiresAt: new Date(Date.now() + 30 * 60000) };
  await user.save();
  const root = (config.frontendUrl || process.env.FRONTEND_URL || '').replace(/\/$/, '');
  await sendEmail({ to: email, subject: 'Confirm your FlowTask email address', html: `<p>Confirm the email change you requested. This link expires in 30 minutes.</p><p><a href="${root}/confirm-email-change?token=${token}">Confirm email change</a></p>` });
  await sendEmail({ to: oldEmail, subject: 'FlowTask email change requested', html: '<p>A change to your account email was requested. Your current address remains in use until the new address is confirmed. If you did not request this, change your password.</p>' });
  return true;
}

export async function confirmEmailChange(userId, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new ErrorResponse('Invalid confirmation token', 400);
  // Compare-and-swap makes the hashed token single-use and account-bound.
  const user = await User.findOne({ _id: userId, 'pendingEmailChange.tokenHash': digest(token), 'pendingEmailChange.expiresAt': { $gt: new Date() } }).select('+pendingEmailChange');
  if (!user) throw new ErrorResponse('Email confirmation is invalid or expired', 400);
  const email = user.pendingEmailChange.email;
  if (await User.exists({ email, _id: { $ne: userId } })) throw new ErrorResponse('Email address unavailable', 409);
  const updated = await User.findOneAndUpdate({ _id: userId, 'pendingEmailChange.tokenHash': digest(token), 'pendingEmailChange.expiresAt': { $gt: new Date() } }, { $set: { email }, $unset: { pendingEmailChange: 1 } }, { new: true, runValidators: true });
  if (!updated) throw new ErrorResponse('Email confirmation is invalid or expired', 400);
  invalidateAuthCache(userId);
  return { email: updated.email };
}

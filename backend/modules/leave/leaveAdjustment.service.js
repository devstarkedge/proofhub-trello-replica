import mongoose from 'mongoose';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Workspace from '../../models/Workspace.js';
import User from '../../models/User.js';
import AuditLog from '../../models/AuditLog.js';
import LeaveType from './leaveType.model.js';
import LeaveLedger from './leaveLedger.model.js';
import LeaveAccrualBucket from './leaveAccrualBucket.model.js';
import { getEffectiveEmploymentProfile } from './leaveEmployeeProfile.service.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, computeExpiryDate } from './leaveTimezone.util.js';
import { resolvePolicyContext, findLeaveTypeRule } from './leavePolicy.service.js';
import { creditBucket, debitViaFIFO } from './leaveBalance.service.js';
import * as leaveHooks from './leaveHooks.js';

/**
 * Manual HR/Admin balance adjustment — always a ledger entry, never a
 * direct balance overwrite. A credit mints a new bucket that expires the
 * same way a normal accrual would, with an optional expiry for that credit; a debit
 * draws down existing active buckets FIFO exactly like leave consumption.
 * Every adjustment requires a reason and is audit-logged.
 */
export function normalizeAdjustmentExpiry(expiryRule, numericAmount) {
  if (expiryRule === undefined) return undefined;
  if (numericAmount < 0) throw new ErrorResponse('Expiry can only be set for a leave credit', 400);
  if (!expiryRule || typeof expiryRule !== 'object' || Array.isArray(expiryRule)
    || !['NEVER', 'FIXED_MONTHS_AFTER_CREDIT', 'CALENDAR_YEAR_END'].includes(expiryRule.mode)) {
    throw new ErrorResponse('Choose a valid credit expiry option', 400);
  }
  if (expiryRule.mode === 'FIXED_MONTHS_AFTER_CREDIT') {
    if (!Number.isSafeInteger(expiryRule.months) || expiryRule.months < 1) {
      throw new ErrorResponse('Expiry months must be a positive whole number', 400);
    }
    return { mode: expiryRule.mode, months: expiryRule.months };
  }
  if (expiryRule.months != null) throw new ErrorResponse('Expiry months only apply to fixed-month expiry', 400);
  return { mode: expiryRule.mode, months: null };
}

export async function createManualAdjustment({ workspaceId, actor, userId, leaveTypeId, amount, operation, count, reason, clientAdjustmentId, expiryRule }) {
  if (!reason || !reason.trim()) throw new ErrorResponse('A reason is required for a manual adjustment', 400);
  const hasCount = operation !== undefined || count !== undefined;
  if (hasCount && (amount !== undefined || !['CREDIT', 'DEBIT'].includes(operation) || count === '' || count === null)) throw new ErrorResponse('Choose Credit or Debit and enter a positive leave count; do not send a signed amount', 400);
  const numericAmount = hasCount ? Number(count) * (operation === 'DEBIT' ? -1 : 1) : Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount === 0 || Math.abs(numericAmount) > 1000000 || (hasCount && Number(count) < 0)) throw new ErrorResponse('Leave count must be positive and at most 1000000', 400);
  if (clientAdjustmentId !== undefined && (typeof clientAdjustmentId !== 'string' || !clientAdjustmentId.trim() || clientAdjustmentId.length > 100)) throw new ErrorResponse('Invalid adjustment request identifier', 400);
  const adjustmentExpiryRule = normalizeAdjustmentExpiry(expiryRule, numericAmount);
  const creditedAt = new Date();

  const leaveType = await LeaveType.findOne({ _id: leaveTypeId, workspaceId }).lean();
  if (!leaveType || !leaveType.isActive) throw new ErrorResponse('Active leave type not found', 404);

  const actorId = actor._id || actor.id;
  const session = await mongoose.startSession();
  let result;
  let replayed = false;

  try {
    await session.withTransaction(async () => {
      // The workspace write serializes idempotency checks and balance-cap checks.
      await Workspace.updateOne({ _id: workspaceId }, { $inc: { __v: 1 } }, { session });
      if (clientAdjustmentId) {
        const existing = await LeaveLedger.find({ workspaceId, actor: actorId, clientAdjustmentId }).session(session).lean();
        if (existing.length) {
          const total = existing.reduce((n, e) => n + e.amount, 0);
          if (existing.some((e) => String(e.user) !== String(userId) || String(e.leaveType) !== String(leaveTypeId) || e.reason !== reason.trim() || e.type !== (numericAmount > 0 ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT')) || Math.abs(total - Math.abs(numericAmount)) > 1e-9) throw new ErrorResponse('This adjustment identifier was already used with different values', 409);
          if (existing.some((e) => (e.adjustmentExpiryRule?.mode || null) !== (adjustmentExpiryRule?.mode || null)
            || (e.adjustmentExpiryRule?.months ?? null) !== (adjustmentExpiryRule?.months ?? null))) {
            throw new ErrorResponse('This adjustment identifier was already used with a different expiry', 409);
          }
          result = { ledgerEntries: existing, replayed: true };
          replayed = true;
          return;
        }
      }
      const membership = await WorkspaceMembership.findOne({
        workspace: workspaceId, user: userId, status: 'active'
      }).session(session);
      if (!membership) throw new ErrorResponse('User is not an active member of this workspace', 404);

      const policyContext = await resolvePolicyContext({ workspaceId, userId, membership, date: new Date() });
      if (!policyContext) throw new ErrorResponse('User has no applicable leave policy for an adjustment', 400);

      const rule = findLeaveTypeRule(policyContext.policyVersion, leaveTypeId);
      const profile = await getEffectiveEmploymentProfile({ workspaceId, userId });
      if (!rule || !(rule.eligibleEmploymentStatuses || ['ACTIVE', 'ON_PROBATION']).includes(profile.employmentStatus)) throw new ErrorResponse('Employee is not eligible for this leave type under the applicable policy', 400);
      const increment = leaveType.category === 'SHORT_LEAVE' || !leaveType.supportsHalfDay || !rule.halfDayEnabled ? 1 : 0.5;
      if (!Number.isInteger(Math.abs(numericAmount) / increment)) throw new ErrorResponse(`This leave type requires increments of ${increment} leave(s)`, 400);
      if (numericAmount > 0 && rule.maxBalanceCap != null) {
        const buckets = await LeaveAccrualBucket.find({ workspaceId, user: userId, leaveType: leaveTypeId, status: 'active', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }).session(session);
        const balance = buckets.reduce((n, b) => n + b.creditedAmount - b.consumedAmount - (b.debitedAmount || 0) - b.expiredAmount, 0);
        if (balance + numericAmount > rule.maxBalanceCap) throw new ErrorResponse('Credit would exceed the policy balance cap', 400);
      }
      if (numericAmount > 0) {
        const workspaceDoc = await Workspace.findById(workspaceId).select('timezone').session(session);
        const timezone = getWorkspaceTimezone(workspaceDoc);
        const expiresAt = computeExpiryDate(creditedAt, adjustmentExpiryRule || rule.expiryRule, timezone);
        if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= creditedAt)) {
          throw new ErrorResponse('Credit expiry must resolve to a valid future date', 400);
        }

        const { bucket, ledgerEntry } = await creditBucket({
          workspaceId, user: userId, leaveType: leaveTypeId, policyVersion: policyContext.policyVersion._id,
          period: null, sourceType: 'MANUAL_CREDIT', amount: numericAmount, creditedAt, expiresAt, adjustmentExpiryRule,
          reason: reason.trim(), createdBy: actorId, session, ledgerType: 'MANUAL_CREDIT', clientAdjustmentId, actorRole: actor.role,
          policySource: { assignmentId: policyContext.assignment._id, scope: policyContext.assignment.scope, scopeRef: policyContext.assignment.scopeRef }
        });
        result = { bucket: bucket.toObject(), ledgerEntries: [ledgerEntry.toObject()] };
      } else {
        const entries = await debitViaFIFO({
          workspaceId, user: userId, leaveType: leaveTypeId, amount: Math.abs(numericAmount),
          reason: reason.trim(), actor: actorId, session, clientAdjustmentId, actorRole: actor.role
        });
        result = { ledgerEntries: entries.map((entry) => entry.toObject()) };
      }

      await AuditLog.create([{
        workspace: workspaceId, actor: actorId, action: 'LEAVE_MANUAL_ADJUSTMENT', category: 'leave_management',
        targetType: 'User', targetId: userId,
        changes: { before: null, after: { leaveType: leaveType.key, amount: numericAmount, reason,
          ...(numericAmount > 0 ? { expiryRule: adjustmentExpiryRule || rule.expiryRule, expiresAt: result.bucket.expiresAt,
            expirySource: adjustmentExpiryRule ? 'MANUAL' : 'POLICY' } : {}) } }
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  if (replayed) return result;
  try {
    await leaveHooks.onBalanceAdjusted({
      workspaceId, userId, actorUserId: actorId, leaveTypeName: leaveType.name, amount: numericAmount, reason
    });
  } catch (error) {
    console.error('[Leave] post-adjustment notification error:', error.message);
  }

  return result;
}

/**
 * List adjustment history (MANUAL_CREDIT and MANUAL_DEBIT ledger entries)
 * with filtering by user, leave type, operation, date range, search, and pagination.
 */
export async function listManualAdjustments({
  workspaceId, page = 1, limit = 20, userId, leaveTypeId, operation, startDate, endDate, search
}) {
  const query = {
    workspaceId,
    type: { $in: ['MANUAL_CREDIT', 'MANUAL_DEBIT'] }
  };

  if (operation === 'CREDIT') {
    query.type = 'MANUAL_CREDIT';
  } else if (operation === 'DEBIT') {
    query.type = 'MANUAL_DEBIT';
  }

  if (userId) {
    query.user = userId;
  }

  if (leaveTypeId) {
    query.leaveType = leaveTypeId;
  }

  if (startDate || endDate) {
    query.occurredAt = {};
    if (startDate) {
      query.occurredAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.occurredAt.$lte = end;
    }
  }

  if (search && search.trim()) {
    const term = search.trim();
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
      ]
    }).select('_id').lean();
    const matchingUserIds = matchingUsers.map((u) => u._id);

    query.$or = [
      { user: { $in: matchingUserIds } },
      { actor: { $in: matchingUserIds } },
      { reason: { $regex: term, $options: 'i' } }
    ];
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const [total, adjustments] = await Promise.all([
    LeaveLedger.countDocuments(query),
    LeaveLedger.find(query)
      .sort({ occurredAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('user', 'name email avatar')
      .populate('actor', 'name email avatar')
      .populate('leaveType', 'name key color category')
      .populate('policyVersion', 'versionNumber status')
      .populate('bucket', 'creditedAmount consumedAmount debitedAmount status creditedAt expiresAt')
      .lean()
  ]);

  return {
    adjustments,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit)
    }
  };
}

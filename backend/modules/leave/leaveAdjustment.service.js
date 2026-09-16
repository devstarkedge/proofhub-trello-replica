import mongoose from 'mongoose';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import Workspace from '../../models/Workspace.js';
import AuditLog from '../../models/AuditLog.js';
import LeaveType from './leaveType.model.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';
import { getWorkspaceTimezone, computeExpiryDate } from './leaveTimezone.util.js';
import { resolvePolicyContext, findLeaveTypeRule } from './leavePolicy.service.js';
import { creditBucket, debitViaFIFO } from './leaveBalance.service.js';
import * as leaveHooks from './leaveHooks.js';

/**
 * Manual HR/Admin balance adjustment — always a ledger entry, never a
 * direct balance overwrite. A credit mints a new bucket that expires the
 * same way a normal accrual would (per the user's current policy); a debit
 * draws down existing active buckets FIFO exactly like leave consumption.
 * Every adjustment requires a reason and is audit-logged.
 */
export async function createManualAdjustment({ workspaceId, actor, userId, leaveTypeId, amount, reason }) {
  if (!reason || !reason.trim()) throw new ErrorResponse('A reason is required for a manual adjustment', 400);
  const numericAmount = Number(amount);
  if (!numericAmount) throw new ErrorResponse('Adjustment amount must be non-zero', 400);

  const leaveType = await LeaveType.findOne({ _id: leaveTypeId, workspaceId }).lean();
  if (!leaveType) throw new ErrorResponse('Leave type not found', 404);

  const actorId = actor._id || actor.id;
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      if (numericAmount > 0) {
        const membership = await WorkspaceMembership.findOne({
          workspace: workspaceId, user: userId, status: 'active'
        }).session(session);
        if (!membership) throw new ErrorResponse('User is not an active member of this workspace', 404);

        const policyContext = await resolvePolicyContext({ workspaceId, userId, membership, date: new Date() });
        if (!policyContext) throw new ErrorResponse('User has no applicable leave policy for a credit adjustment', 400);

        const rule = findLeaveTypeRule(policyContext.policyVersion, leaveTypeId);
        const workspaceDoc = await Workspace.findById(workspaceId).select('timezone').session(session);
        const timezone = getWorkspaceTimezone(workspaceDoc);
        const expiresAt = rule ? computeExpiryDate(new Date(), rule.expiryRule, timezone) : null;

        const { bucket, ledgerEntry } = await creditBucket({
          workspaceId, user: userId, leaveType: leaveTypeId, policyVersion: policyContext.policyVersion._id,
          period: null, sourceType: 'MANUAL_CREDIT', amount: numericAmount, creditedAt: new Date(), expiresAt,
          reason, createdBy: actorId, session, ledgerType: 'MANUAL_CREDIT'
        });
        result = { bucket: bucket.toObject(), ledgerEntries: [ledgerEntry.toObject()] };
      } else {
        const entries = await debitViaFIFO({
          workspaceId, user: userId, leaveType: leaveTypeId, amount: Math.abs(numericAmount),
          reason, actor: actorId, session
        });
        result = { ledgerEntries: entries.map((entry) => entry.toObject()) };
      }

      await AuditLog.create([{
        workspace: workspaceId, actor: actorId, action: 'LEAVE_MANUAL_ADJUSTMENT', category: 'leave_management',
        targetType: 'User', targetId: userId,
        changes: { before: null, after: { leaveType: leaveType.key, amount: numericAmount, reason } }
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  try {
    await leaveHooks.onBalanceAdjusted({
      workspaceId, userId, actorUserId: actorId, leaveTypeName: leaveType.name, amount: numericAmount, reason
    });
  } catch (error) {
    console.error('[Leave] post-adjustment notification error:', error.message);
  }

  return result;
}

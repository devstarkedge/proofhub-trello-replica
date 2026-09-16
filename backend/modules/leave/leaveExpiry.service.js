import mongoose from 'mongoose';
import LeaveAccrualBucket from './leaveAccrualBucket.model.js';
import LeaveLedger from './leaveLedger.model.js';
import LeaveType from './leaveType.model.js';
import Workspace from '../../models/Workspace.js';
import * as workspaceContext from '../workspaces/workspaceContext.js';
import * as leaveHooks from './leaveHooks.js';

/**
 * Expire every active bucket past its `expiresAt` for one workspace.
 * Idempotent by construction, not by a unique-index/catch-duplicate trick:
 * the update only matches `status:'active'`, so once a bucket flips to
 * 'expired' a second sweep pass matches nothing — safe to run as often as
 * the scheduler likes, and safe to re-run after a crash mid-sweep. Only
 * `credited - consumed - reserved` expires; an active reservation against
 * a bucket past its nominal expiry stays protected until it's released
 * (rejected/cancelled) or consumed (approved) — see leaveBalance.service.js.
 */
export async function runExpirySweepForWorkspace(workspaceId) {
  return workspaceContext.run({ workspaceId }, async () => {
    const now = new Date();
    const candidates = await LeaveAccrualBucket.find({
      workspaceId, status: 'active', expiresAt: { $lte: now }
    }).select('_id').lean();

    let expiredCount = 0;
    const expiredForNotification = [];

    for (const candidate of candidates) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const updated = await LeaveAccrualBucket.findOneAndUpdate(
            { _id: candidate._id, workspaceId, status: 'active', expiresAt: { $lte: now } },
            [{
              $set: {
                expiredAmount: {
                  $max: [0, { $subtract: [{ $subtract: ['$creditedAmount', '$consumedAmount'] }, '$reservedAmount'] }]
                },
                status: 'expired',
                expiredAt: now
              }
            }],
            { session, new: true }
          );
          if (!updated) return; // already processed by a concurrent/previous sweep — genuine no-op

          if (updated.expiredAmount > 0) {
            await LeaveLedger.create([{
              workspaceId, user: updated.user, leaveType: updated.leaveType, bucket: updated._id,
              type: 'LEAVE_EXPIRED', amount: updated.expiredAmount, actor: null, occurredAt: now,
              policyVersion: updated.policyVersion
            }], { session });
            expiredForNotification.push(updated.toObject());
          }
          expiredCount++;
        });
      } catch (error) {
        console.error('[Leave] expiry sweep error', { workspaceId, bucketId: candidate._id, error: error.message });
      } finally {
        await session.endSession();
      }
    }

    if (expiredForNotification.length > 0) {
      const leaveTypeIds = Array.from(new Set(expiredForNotification.map((b) => String(b.leaveType))));
      const leaveTypes = await LeaveType.find({ _id: { $in: leaveTypeIds } }).select('name').lean();
      const nameById = new Map(leaveTypes.map((lt) => [String(lt._id), lt.name]));
      for (const bucket of expiredForNotification) {
        try {
          await leaveHooks.onBucketExpired({
            workspaceId, userId: bucket.user,
            leaveTypeName: nameById.get(String(bucket.leaveType)) || 'leave',
            amount: bucket.expiredAmount
          });
        } catch (error) {
          console.error('[Leave] post-expiry notification error:', error.message);
        }
      }
    }

    return { scanned: candidates.length, expired: expiredCount };
  });
}

export async function runExpirySweepForAllWorkspaces() {
  const workspaces = await Workspace.find({ leaveModuleEnabled: true }).select('_id').lean();
  const results = [];
  for (const workspace of workspaces) {
    const result = await runExpirySweepForWorkspace(workspace._id);
    results.push({ workspaceId: workspace._id, ...result });
  }
  return results;
}

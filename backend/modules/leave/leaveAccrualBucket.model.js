import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * One bucket per monthly (or manual/restore) credit — never one mutable
 * balance number. Running totals (`consumedAmount`/`reservedAmount`/
 * `expiredAmount`) are updated atomically via conditional `findOneAndUpdate`
 * (see leaveBalance.service.js); "available for reservation" is always
 * computed as `creditedAmount - consumedAmount - reservedAmount -
 * expiredAmount`, never stored redundantly.
 *
 * The unique index on {workspaceId, user, leaveType, policyVersion, period}
 * (period restricted to string values via a partial filter, since
 * MANUAL_CREDIT/CANCELLATION_RESTORE buckets have period: null and must not
 * collide) IS the monthly-accrual idempotency mechanism — a duplicate
 * accrual attempt for the same period fails with E11000, caught as a no-op
 * by leaveAccrual.service.js. No separate lock/flag is needed.
 */
const leaveAccrualBucketSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', required: true },
  // 'YYYY-MM' in the workspace's configured timezone; null for
  // MANUAL_CREDIT/CANCELLATION_RESTORE buckets, which aren't tied to one
  // accrual period.
  period: { type: String, default: null, match: /^\d{4}-\d{2}$/ },
  sourceType: {
    type: String,
    enum: ['MONTHLY_ACCRUAL', 'JOINING_CREDIT', 'MANUAL_CREDIT', 'CANCELLATION_RESTORE'],
    required: true
  },
  creditedAmount: { type: Number, required: true, min: 0 },
  consumedAmount: { type: Number, default: 0, min: 0 },
  reservedAmount: { type: Number, default: 0, min: 0 },
  expiredAmount: { type: Number, default: 0, min: 0 },
  creditedAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'expired', 'void'], default: 'active' },
  expiredAt: { type: Date, default: null },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system/scheduler
  sourceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', default: null } // restore buckets only
}, { timestamps: true });

leaveAccrualBucketSchema.index(
  { workspaceId: 1, user: 1, leaveType: 1, policyVersion: 1, period: 1 },
  { unique: true, partialFilterExpression: { period: { $type: 'string' } } }
);
// FIFO consumption ordering: earliest-expiring-first among active buckets.
leaveAccrualBucketSchema.index({ workspaceId: 1, user: 1, leaveType: 1, status: 1, expiresAt: 1, creditedAt: 1 });
// Expiry sweep.
leaveAccrualBucketSchema.index({ workspaceId: 1, status: 1, expiresAt: 1 });

leaveAccrualBucketSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveAccrualBucket', leaveAccrualBucketSchema);

import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Append-only transaction journal — the permanent record of every balance
 * movement. Immutable after creation (identical guard shape to
 * MilestoneApproval.js): corrections are always a new compensating entry,
 * never an edit to history. `amount` is always positive; `type` conveys
 * direction. `relatedEntryId` links a consume/restore/release back to the
 * reserve/consume entry it reverses, so a bucket's running totals can always
 * be independently recomputed from its ledger entries as a correctness
 * check.
 *
 * No separate "LeaveAdjustment" collection — a manual HR/Admin credit or
 * debit is exactly this shape (MANUAL_CREDIT / MANUAL_DEBIT) plus a bucket
 * effect; `LeaveLedger.find({type: {$in: ['MANUAL_CREDIT','MANUAL_DEBIT']}})`
 * is already the adjustment history/report.
 */
const leaveLedgerSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  bucket: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveAccrualBucket', default: null },
  request: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', default: null },
  requestDay: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequestDay', default: null },
  type: {
    type: String,
    enum: [
      'MONTHLY_CREDIT',
      'LEAVE_RESERVED',
      'RESERVATION_RELEASED',
      'LEAVE_CONSUMED',
      'LEAVE_RESTORED',
      'LEAVE_EXPIRED',
      'MANUAL_CREDIT',
      'MANUAL_DEBIT',
      'CANCELLATION_RESTORE',
      'POLICY_MIGRATION_ADJUSTMENT'
    ],
    required: true
  },
  amount: { type: Number, required: true, min: 0 },
  relatedEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveLedger', default: null },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system-generated
  occurredAt: { type: Date, required: true, default: Date.now },
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'LeavePolicyVersion', default: null }
}, { timestamps: true });

leaveLedgerSchema.index({ workspaceId: 1, user: 1, leaveType: 1, occurredAt: 1 });
leaveLedgerSchema.index({ workspaceId: 1, request: 1 });
leaveLedgerSchema.index({ workspaceId: 1, bucket: 1 });
leaveLedgerSchema.index({ workspaceId: 1, type: 1, occurredAt: 1 });

leaveLedgerSchema.plugin(workspaceScopePlugin);

const immutableLedgerError = (next) => next(new Error('Leave ledger entries are immutable'));
leaveLedgerSchema.pre('save', function preventLedgerResave(next) {
  if (!this.isNew) return immutableLedgerError(next);
  return next();
});
leaveLedgerSchema.pre('findOneAndUpdate', immutableLedgerError);
leaveLedgerSchema.pre('findOneAndReplace', immutableLedgerError);
leaveLedgerSchema.pre('updateOne', immutableLedgerError);
leaveLedgerSchema.pre('updateMany', immutableLedgerError);
leaveLedgerSchema.pre('replaceOne', immutableLedgerError);
leaveLedgerSchema.pre('findOneAndDelete', immutableLedgerError);
leaveLedgerSchema.pre('deleteOne', immutableLedgerError);
leaveLedgerSchema.pre('deleteMany', immutableLedgerError);

export default mongoose.model('LeaveLedger', leaveLedgerSchema);

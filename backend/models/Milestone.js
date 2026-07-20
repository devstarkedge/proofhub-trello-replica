import mongoose from 'mongoose';

export const MILESTONE_STATUSES = Object.freeze({
  PENDING: 'pending',
  ACTIVE: 'active',
  IN_PROGRESS: 'in-progress',
  PAID: 'paid'
});

const milestoneSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  amountCents: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER },
  approvedAmountCents: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER, default: 0 },
  dueDate: { type: Date, default: null },
  order: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: Object.values(MILESTONE_STATUSES),
    required: true,
    default: MILESTONE_STATUSES.PENDING
  },
  paidAt: { type: Date, default: null },
  revenueRecognizedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  optimisticConcurrency: true
});

// Cross-field validators do not have access to the persisted document during
// query updates. Keep this invariant on document validation; approval query
// updates enforce the same rule atomically in their match criteria.
milestoneSchema.pre('validate', function validateApprovedAmount(next) {
  if (this.approvedAmountCents > this.amountCents) {
    this.invalidate(
      'approvedAmountCents',
      'Approved amount cannot exceed milestone amount',
      this.approvedAmountCents
    );
  }
  next();
});

milestoneSchema.index({ board: 1, order: 1 }, { unique: true });
milestoneSchema.index({ board: 1, status: 1, paidAt: 1 });
milestoneSchema.index({ revenueRecognizedAt: 1, board: 1 });

export default mongoose.model('Milestone', milestoneSchema);

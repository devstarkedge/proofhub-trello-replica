import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const milestoneApprovalSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone', required: true, index: true },
  amountCents: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedAt: { type: Date, required: true, default: Date.now },
  sourceType: { type: String, enum: ['task', 'subtask', 'nanoSubtask'], required: true },
  sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sourceTitle: { type: String, trim: true, maxlength: 200 },
  note: { type: String, trim: true, maxlength: 500 },
  idempotencyKey: { type: String, required: true, trim: true, minlength: 8, maxlength: 128 }
}, { timestamps: true });

milestoneApprovalSchema.index({ workspaceId: 1, board: 1, idempotencyKey: 1 }, { unique: true });
milestoneApprovalSchema.index({ workspaceId: 1, milestone: 1, approvedAt: 1 });
milestoneApprovalSchema.index({ workspaceId: 1, sourceType: 1, sourceId: 1 });

milestoneApprovalSchema.plugin(workspaceScopePlugin);

const immutableHistoryError = (next) => next(new Error('Milestone approval history is immutable'));
milestoneApprovalSchema.pre('save', function preventApprovalResave(next) {
  if (!this.isNew) return immutableHistoryError(next);
  return next();
});
milestoneApprovalSchema.pre('findOneAndUpdate', immutableHistoryError);
milestoneApprovalSchema.pre('findOneAndReplace', immutableHistoryError);
milestoneApprovalSchema.pre('updateOne', immutableHistoryError);
milestoneApprovalSchema.pre('updateMany', immutableHistoryError);
milestoneApprovalSchema.pre('replaceOne', immutableHistoryError);
milestoneApprovalSchema.pre('findOneAndDelete', immutableHistoryError);
milestoneApprovalSchema.pre('deleteOne', immutableHistoryError);
milestoneApprovalSchema.pre('deleteMany', immutableHistoryError);

export default mongoose.model('MilestoneApproval', milestoneApprovalSchema);

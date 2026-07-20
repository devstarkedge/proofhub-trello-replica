import mongoose from 'mongoose';

const milestoneRevenueRecognitionSchema = new mongoose.Schema({
  board: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true, index: true },
  milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone', required: true, unique: true },
  triggeringApproval: { type: mongoose.Schema.Types.ObjectId, ref: 'MilestoneApproval', required: true, unique: true },
  amountCents: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER },
  recognizedAt: { type: Date, required: true },
  recognizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

milestoneRevenueRecognitionSchema.index({ board: 1, recognizedAt: 1 });

const immutableLedgerError = (next) => next(new Error('Milestone revenue recognition history is immutable'));
milestoneRevenueRecognitionSchema.pre('save', function preventRecognitionResave(next) {
  if (!this.isNew) return immutableLedgerError(next);
  return next();
});
milestoneRevenueRecognitionSchema.pre('findOneAndUpdate', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('findOneAndReplace', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('updateOne', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('updateMany', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('replaceOne', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('findOneAndDelete', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('deleteOne', immutableLedgerError);
milestoneRevenueRecognitionSchema.pre('deleteMany', immutableLedgerError);

export default mongoose.model('MilestoneRevenueRecognition', milestoneRevenueRecognitionSchema);

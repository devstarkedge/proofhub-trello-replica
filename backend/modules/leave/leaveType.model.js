import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Leave type catalog — Full Day, Short Leave, Half Day, Unpaid, etc. Stable
 * identity referenced by ObjectId from LeavePolicyVersion.leaveTypeRules,
 * LeaveAccrualBucket, LeaveLedger, and LeaveRequest, so a type's display
 * name/color can change without touching historical records.
 *
 * `category: 'SHORT_LEAVE'` is not a special-cased consumption path anywhere
 * in the accrual/ledger/reservation engine — a short-leave type accrues,
 * expires, reserves, and consumes through the exact same bucket/ledger
 * machinery as any other type. The only category-specific behavior is
 * LeavePolicyVersion.leaveTypeRules[].maxDurationMinutesPerInstance (checked
 * against LeaveRequestDay.shortLeaveDurationMinutes at request time) and the
 * start/end-time capture on LeaveRequestDay itself.
 */
const leaveTypeSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  key: { type: String, required: true, trim: true, lowercase: true, maxlength: 50 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  color: { type: String, trim: true, default: '#3b82f6' },
  icon: { type: String, trim: true, default: '' },
  category: {
    type: String,
    enum: ['STANDARD', 'SHORT_LEAVE', 'UNPAID', 'COMPENSATORY'],
    default: 'STANDARD'
  },
  supportsHalfDay: { type: Boolean, default: true },
  displayOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leaveTypeSchema.index({ workspaceId: 1, key: 1 }, { unique: true });
leaveTypeSchema.index({ workspaceId: 1, isActive: 1, displayOrder: 1 });

leaveTypeSchema.plugin(workspaceScopePlugin);

export default mongoose.model('LeaveType', leaveTypeSchema);

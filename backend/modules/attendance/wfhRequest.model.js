import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * A Work-From-Home request for a date/range. Approval routing is handled
 * by the shared AttendanceApproval model (entityType:'WFH_REQUEST'),
 * mirroring how LeaveRequest defers to LeaveApproval rather than embedding
 * approval state itself.
 */
const wfhRequestSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, trim: true, maxlength: 1000, default: '' },
  isRecurring: { type: Boolean, default: false },
  status: { type: String, enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING_APPROVAL' },
  // Snapshotted at submission — a later policy edit must never
  // retroactively change whether THIS request needed approval or what its
  // rules were (spec §21's versioning principle, applied here too).
  policyVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendancePolicyVersion', default: null },
  requiredApproval: { type: Boolean, default: true },
  decidedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

wfhRequestSchema.index({ workspaceId: 1, requester: 1, startDate: 1 });
wfhRequestSchema.index({ workspaceId: 1, status: 1 });

wfhRequestSchema.plugin(workspaceScopePlugin);

export default mongoose.model('WfhRequest', wfhRequestSchema);

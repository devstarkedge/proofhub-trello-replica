import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * A request to correct an attendance record — never edits AttendanceDay/
 * AttendanceSession directly (spec §34, §54). `originalSnapshot` freezes
 * what the record showed at submission time; `proposedCorrection` is the
 * employee's ask; `finalCorrection` is what an approver actually applied
 * (may differ from proposed). The resolver re-derives AttendanceDay's
 * presence/punctuality fields from `finalCorrection` once approved —
 * original session evidence is never overwritten.
 */
const attendanceRegularizationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workDateKey: { type: String, required: true },
  attendanceDay: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDay', default: null },
  attendanceSession: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', default: null },
  type: {
    type: String,
    enum: ['MISSED_CHECK_IN', 'MISSED_CHECK_OUT', 'INCORRECT_TIME', 'GPS_PROBLEM', 'FIELD_WORK', 'FORGOTTEN_ATTENDANCE', 'OTHER'],
    required: true
  },
  originalSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  proposedCorrection: { type: mongoose.Schema.Types.Mixed, required: true },
  finalCorrection: { type: mongoose.Schema.Types.Mixed, default: null },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING_APPROVAL' },
  decidedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceRegularizationSchema.index({ workspaceId: 1, requester: 1, workDateKey: 1 });
attendanceRegularizationSchema.index({ workspaceId: 1, status: 1 });

attendanceRegularizationSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceRegularization', attendanceRegularizationSchema);

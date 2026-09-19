import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Maps a shift to who it applies to. Resolution mirrors
 * leavePolicy.service.js#resolveAssignmentForUser exactly: most specific
 * scope wins (user > department > workspace default), tie-broken by
 * priority then most recent effectiveFrom — see
 * attendanceShiftResolver.service.js.
 */
const attendanceShiftAssignmentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceShift', required: true },
  scope: { type: String, enum: ['workspace', 'department', 'user'], required: true },
  scopeRef: { type: mongoose.Schema.Types.ObjectId, default: null }, // Department or User id; null when scope='workspace'
  priority: { type: Number, default: 0 },
  effectiveFrom: { type: Date, required: true },
  effectiveUntil: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceShiftAssignmentSchema.index({ workspaceId: 1, scope: 1, scopeRef: 1, isActive: 1 });
attendanceShiftAssignmentSchema.index({ workspaceId: 1, shift: 1 });

attendanceShiftAssignmentSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceShiftAssignment', attendanceShiftAssignmentSchema);

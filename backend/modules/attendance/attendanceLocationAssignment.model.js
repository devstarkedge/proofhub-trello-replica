import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

/**
 * Which employees/departments may check in at which location. An employee
 * may have multiple allowed locations (multiple rows). Never trust a bare
 * `locationId` from the client — always re-validate workspaceId + active +
 * that an assignment (direct, department, or the policy's
 * ANY_ACTIVE_WORKSPACE_LOCATION flag) actually grants it — see
 * attendanceGeofence.service.js#resolveEligibleLocations.
 */
const attendanceLocationAssignmentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLocation', required: true },
  scope: { type: String, enum: ['user', 'department'], required: true },
  scopeRef: { type: mongoose.Schema.Types.ObjectId, required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceLocationAssignmentSchema.index({ workspaceId: 1, scope: 1, scopeRef: 1, isActive: 1 });
attendanceLocationAssignmentSchema.index({ workspaceId: 1, location: 1 });

attendanceLocationAssignmentSchema.plugin(workspaceScopePlugin);

export default mongoose.model('AttendanceLocationAssignment', attendanceLocationAssignmentSchema);

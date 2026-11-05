import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, generatedBy: String,
  operationId: String, digest: String, name: String, filters: mongoose.Schema.Types.Mixed,
  projectIds: [mongoose.Schema.Types.ObjectId], subjectIds: [mongoose.Schema.Types.ObjectId], departmentIds: [mongoose.Schema.Types.ObjectId],
  status: { type: String, enum: ['QUEUED','PROCESSING','READY','EMPTY','FAILED'], default: 'QUEUED' },
  active: { type: Boolean, default: true }, leaseOwner: String, leaseUntil: Date,
  emailStatus: { type: String, enum: ['NONE','PENDING','SENDING','SENT','FAILED','UNKNOWN'], default: 'NONE' },
  recipients: [String], emailError: String, emailSentAt: Date,
  rowsCount: Number, totalSeconds: Number, sessionCount: Number, error: String,
  workbook: { type: Buffer, select: false }, rows: { type: Buffer, select: false },
  completedAt: Date, expiresAt: { type: Date, required: true }
}, { timestamps: true });
schema.index({ workspaceId: 1, createdBy: 1, operationId: 1 }, { unique: true });
schema.index({ workspaceId: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ workspaceId: 1, createdAt: -1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('TrackingGeneratedReport', schema);

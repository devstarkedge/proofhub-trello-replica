import mongoose from 'mongoose';
import workspaceScopePlugin from '../../modules/workspaces/workspaceScopePlugin.js';
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  request: { type: mongoose.Schema.Types.ObjectId, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  dateKey: { type: String, required: true }, dueAt: Date,
  revision: { type: Number, default: 0 }, digest: String,
  payload: mongoose.Schema.Types.Mixed, destinations: { type: [String], default: [] },
  deliveredRevision: { type: Number, default: 0 }, availableAt: { type: Date, default: () => new Date(0) },
  attempts: { type: Number, default: 0 }, lastError: String,
  needsReconcile: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ workspaceId: 1, request: 1, user: 1, dateKey: 1 }, { unique: true });
schema.index({ workspaceId: 1, availableAt: 1 });
schema.index({ workspaceId: 1, needsReconcile: -1, _id: 1 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('LeaveReportingDelivery', schema);

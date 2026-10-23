import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';

// Persist side effects with the business transaction so notifications survive
// restarts without delaying the request/decision response.
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  key: { type: String, required: true },
  kind: { type: String, enum: ['SUBMITTED', 'DECIDED'], required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  completedSteps: { type: [String], default: [] },
  availableAt: { type: Date, default: Date.now },
  claimedUntil: { type: Date, default: () => new Date(0) },
  attempts: { type: Number, default: 0 },
  processedAt: { type: Date, default: null }
}, { timestamps: true });
schema.index({ workspaceId: 1, key: 1 }, { unique: true });
schema.index({ workspaceId: 1, processedAt: 1, availableAt: 1, claimedUntil: 1 });
schema.index({ processedAt: 1 }, { expireAfterSeconds: 30 * 86400 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('LeaveEvent', schema);

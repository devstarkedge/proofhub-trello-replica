import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  publicId: { type: String, required: true }, resourceType: { type: String, required: true },
  deliveryType: { type: String, default: 'upload' },
  state: { type: String, enum: ['pending', 'processing', 'completed'], default: 'pending' },
  attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, default: Date.now },
  leaseToken: String, leaseUntil: Date, lastErrorCode: String,
  expiresAt: { type: Date, index: { expires: 0 } }
}, { timestamps: true });
schema.index({ workspaceId: 1, publicId: 1, resourceType: 1, deliveryType: 1 }, { unique: true });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('FileDeletionJob', schema);

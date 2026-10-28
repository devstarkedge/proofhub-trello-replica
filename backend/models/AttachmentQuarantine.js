import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

// Permanent preservation, not trash: no TTL and no automatic purge worker.
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Workspace' },
  original: { type: mongoose.Schema.Types.Mixed, required: true },
  sourceFingerprint: { type: String, required: true },
  reason: { type: String, required: true },
  state: { type: String, enum: ['pending', 'secured', 'missing_in_storage', 'metadata_only'], required: true },
  publicId: String,
  resourceType: String,
  deliveryType: String,
  preservedAt: { type: Date, required: true },
  quarantinedAt: Date
}, { collection: 'attachmentquarantines' });
schema.index({ workspaceId: 1, publicId: 1 });
schema.index({ publicId: 1 });
schema.index({ state: 1 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('AttachmentQuarantine', schema);

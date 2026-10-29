import mongoose from 'mongoose';
import workspaceScopePlugin from '../../modules/workspaces/workspaceScopePlugin.js';

const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  leaseToken: String, leaseUntil: { type: Date, default: () => new Date(0) },
  revision: { type: Number, default: 0 }, fingerprint: String, syncedAt: Date, dirty: { type: Boolean, default: true },
  checkoutCursor: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });
schema.index({ workspaceId: 1 }, { unique: true });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('ReportingDirectoryState', schema);

import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true }, user: { type: mongoose.Schema.Types.ObjectId, required: true },
  operationId: { type: String, required: true }, digest: String, board: mongoose.Schema.Types.ObjectId, card: mongoose.Schema.Types.ObjectId,
  destinationListId: mongoose.Schema.Types.ObjectId, position: Number, expectedMovementRevision: Number,
  status: { type: String, enum: ['QUEUED', 'PROCESSING', 'APPLIED', 'FAILED'], default: 'QUEUED' },
  attempts: { type: Number, default: 0 }, retryAt: { type: Date, default: Date.now }, leaseUntil: Date, leaseOwner: String,
  result: mongoose.Schema.Types.Mixed, effect: mongoose.Schema.Types.Mixed, published: { type: Boolean, default: false },
  publicationOwner: String, publicationLease: Date,
  error: String, errorStatus: Number, completedAt: Date, expiresAt: Date
}, { timestamps: true });
schema.index({ workspaceId: 1, user: 1, operationId: 1 }, { unique: true });
schema.index({ status: 1, retryAt: 1 });
schema.index({ status: 1, leaseUntil: 1 });
schema.index({ retryAt: 1, publicationLease: 1, completedAt: 1 }, { partialFilterExpression: { status: 'APPLIED', published: false } });
schema.index({ workspaceId: 1, status: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('CardMovement', schema);

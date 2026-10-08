import mongoose from 'mongoose';
import { SCOPES } from '../authz/catalog.js';
const schema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  permission: { type: String, required: true }, effect: { type: String, enum: ['grant', 'deny'], required: true },
  scope: { type: String, enum: SCOPES, required: true }, scopeIds: [{ type: mongoose.Schema.Types.ObjectId }],
  expiresAt: { type: Date, default: null }, reason: { type: String, required: true, minlength: 10 },
  status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, revokedAt: Date, revokeReason: String, legacy: mongoose.Schema.Types.Mixed
}, { timestamps: true });
schema.index({ workspace: 1, user: 1, status: 1 });
schema.index({ status: 1, expiresAt: 1 });
// Canonical scopeKey avoids Mongo's unique-multikey semantics (array overlap
// is not equality). The service sorts scopeIds and writes this key.
schema.add({ scopeKey: { type: String, required: true, default: '' } });
schema.index({ workspace: 1, user: 1, permission: 1, effect: 1, scope: 1, scopeKey: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
export default mongoose.model('PermissionOverride', schema);

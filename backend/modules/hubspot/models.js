import mongoose from 'mongoose';
import workspaceScopePlugin from '../workspaces/workspaceScopePlugin.js';
const { Schema } = mongoose;
const id = { type: Schema.Types.ObjectId, required: true, immutable: true };
function tenantModel(name, definition, indexes) {
  const schema = new Schema({ workspaceId: { ...id, ref: 'Workspace' }, ...definition }, { timestamps: true });
  for (const [fields, options] of indexes) schema.index(fields, options);
  schema.plugin(workspaceScopePlugin);
  return mongoose.model(name, schema);
}
export const HubSpotConnection = tenantModel('HubSpotConnection', {
  name: { type: String, maxlength: 100, default: '' },
  contactOwnerId: { type: String, default: '' }, ownerValidation: String,
  credential: { type: new Schema({ keyVersion: String, iv: String, tag: String, ciphertext: String }, { _id: false }), select: false },
  portalId: { type: String, required: true }, version: { type: Number, default: 1 },
  enabled: { type: Boolean, default: false }, status: { type: String, enum: ['connected', 'error'], default: 'connected' },
  readVerified: Boolean, writeCapability: { type: String, enum: ['verified', 'unverified'], default: 'unverified' },
  lastSuccessfulSync: Date, lastError: { type: String, default: '' },
  backfillPending: { type: Boolean, default: false }, backfillCursor: Schema.Types.ObjectId,
}, [[{ workspaceId: 1 }, { unique: true }]]);
export const HubSpotMapping = tenantModel('HubSpotMapping', {
  portalId: { type: String, required: true }, clientKey: { type: String, required: true },
  hubspotContactId: String, identityHash: String, lastSyncedHash: String, lastSyncedAt: Date,
  pendingCreateEmail: String, createStartedAt: Date,
}, [
  [{ workspaceId: 1, portalId: 1, clientKey: 1 }, { unique: true }],
  [{ workspaceId: 1, portalId: 1, hubspotContactId: 1 }, { unique: true, partialFilterExpression: { hubspotContactId: { $type: 'string' } } }],
]);
export const HubSpotApproval = tenantModel('HubSpotApproval', {
  tokenHash: { type: String, required: true }, userId: id, sessionHash: String,
  action: { type: String, enum: ['configure', 'toggle'], required: true }, binding: String,
  expiresAt: { type: Date, required: true },
}, [[{ tokenHash: 1 }, { unique: true }], [{ expiresAt: 1 }, { expireAfterSeconds: 0 }]]);
export const HubSpotAudit = tenantModel('HubSpotAudit', {
  actorId: Schema.Types.ObjectId, action: String, portalId: String, configVersion: Number,
  projectId: Schema.Types.ObjectId, sourceVersion: String, attempt: Number, code: String,
  operation: String, outcome: String, durationMs: Number, correlationId: String,
}, [[{ workspaceId: 1, createdAt: -1 }, {}]]);

// Deliberate global coordination tables. Never exposed through HTTP. A shared
// portal is one remote identity namespace even across separate workspaces.
const claimSchema = new Schema({ portalId: String, kind: String, value: String, workspaceId: id, clientKey: String }, { timestamps: true });
claimSchema.index({ portalId: 1, kind: 1, value: 1 }, { unique: true });
export const HubSpotClaim = mongoose.model('HubSpotClaim', claimSchema);
const lockSchema = new Schema({ _id: String, owner: String, expiresAt: Date, nextRequestAt: Date, cooldownUntil: Date });
export const HubSpotLock = mongoose.model('HubSpotLock', lockSchema);
export const HUBSPOT_MODELS = [HubSpotConnection, HubSpotMapping, HubSpotApproval, HubSpotAudit, HubSpotClaim, HubSpotLock];

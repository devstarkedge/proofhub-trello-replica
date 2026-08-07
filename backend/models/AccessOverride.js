import mongoose from 'mongoose';

/**
 * AccessOverride — the single per-user, per-resource permission override table.
 *
 * Replaces the write path of SalesPermission (Sales module matrix) and
 * UserPermission (Finance page toggle), and additionally covers delegated
 * administration ('access_control' resource) using the same shape. One row
 * per (user, resource): {resource: 'sales'}, {resource: 'finance'},
 * {resource: 'access_control'}, and any future module reuses this table
 * instead of shipping a new collection.
 *
 * Precedence at read time (see modules/permissions/permissionEngine.js):
 *   explicit deny > admin role > explicit grant > role default > deny-by-default
 */
const accessOverrideSchema = new mongoose.Schema({
  // Every row is workspace-scoped from day one so the future multi-tenant
  // migration doesn't have to retrofit scoping onto permission data.
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  resource: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  effect: {
    type: String,
    enum: ['grant', 'deny'],
    default: 'grant'
  },
  // Action-key -> boolean map, e.g. { view: true, create: true, export: false }.
  // Keys come from config/permissionRegistry.js RESOURCES[resource].actions.
  actions: {
    type: Map,
    of: Boolean,
    default: () => ({})
  },
  // Reuses the HR Panel's Full Dept / Selected / My Tasks concept so any
  // override (not just department assignment) can carry a scope.
  scope: {
    type: String,
    enum: ['full', 'selected', 'own', 'none'],
    default: 'full'
  },
  scopedResourceIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  }],
  // Time-boxed grants (e.g. external/temporary members). The resolver excludes
  // expired overrides on every read — no cron job is required for correctness.
  expiresAt: {
    type: Date,
    default: null
  },
  reason: {
    type: String,
    trim: true,
    maxlength: [500, 'Reason cannot exceed 500 characters']
  },
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

accessOverrideSchema.index({ user: 1, resource: 1 }, { unique: true });
accessOverrideSchema.index({ resource: 1, isActive: 1 });
accessOverrideSchema.index({ expiresAt: 1 }, { sparse: true });

accessOverrideSchema.statics.isExpired = function (doc) {
  return Boolean(doc?.expiresAt && new Date(doc.expiresAt).getTime() <= Date.now());
};

export default mongoose.model('AccessOverride', accessOverrideSchema);

import mongoose from 'mongoose';

/**
 * Persistent, database-level markers for one-time platform bootstrap
 * operations — deliberately not just "check if the seed file was deleted"
 * or "check if any User has isSuperAdmin:true" (both of those break down:
 * the seed file living in source control can't be safely deleted per
 * deploy, and a later `grantSuperAdmin.js` grant to a second account would
 * make an existence-check look like bootstrap already ran when it hasn't).
 *
 * One document per bootstrap operation, keyed by `key` (e.g.
 * 'SUPER_ADMIN_INITIALIZED'). Presence of a row = that operation has run
 * to completion exactly once; utils/seed.js#bootstrapSuperAdmin() checks
 * this before doing any work and is a safe no-op on every subsequent boot.
 *
 * Not workspace-scoped — this is platform-wide state, the same bucket as
 * User/Workspace/Plan.
 */
const platformBootstrapSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  completedAt: { type: Date, default: Date.now },
  version: { type: String, default: '1' },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.model('PlatformBootstrap', platformBootstrapSchema);

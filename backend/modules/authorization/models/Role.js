import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }, // Null = global/system role
  parentRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },     // Inheritance support
  permissionGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PermissionGroup' }], // Attach bundles
  policies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Policy' }],   // PBAC
  version: { type: Number, default: 1 }, // Used for cache invalidation & JWT sync
  isSystem: { type: Boolean, default: false },
  expiresAt: { type: Date } // Temporary permissions
}, { timestamps: true });

export default mongoose.model('Role', roleSchema);

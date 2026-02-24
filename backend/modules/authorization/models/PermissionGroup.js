import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  resource: { type: String, required: true }, // e.g. 'task', 'billing', 'project'
  action: { type: String, required: true },   // e.g. 'create', 'read', 'update', 'delete', 'assign'
  scope: { type: String, enum: ['own', 'team', 'workspace', 'all'], required: true }, // Boundary
  allowedFields: [{ type: String }],          // Field-level restrictions (empty = all)
  restrictedFields: [{ type: String }]        // Explicit denies
}, { _id: false });

const permissionGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },     // e.g., "Task Management"
  slug: { type: String, required: true, unique: true },
  description: String,
  permissions: [permissionSchema],
  isSystem: { type: Boolean, default: false } // System groups cannot be deleted
}, { timestamps: true });

export default mongoose.model('PermissionGroup', permissionGroupSchema);

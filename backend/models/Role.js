import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

/**
 * Permission Schema - Embedded in Role
 * Defines granular permissions for different actions
 */
const permissionSchema = new mongoose.Schema({
  // Creation Permissions
  canCreateDepartment: { type: Boolean, default: false },
  canCreateTask: { type: Boolean, default: false },
  canCreateProject: { type: Boolean, default: false },
  canCreateAnnouncement: { type: Boolean, default: false },
  canCreateReminder: { type: Boolean, default: false },
  
  // Member Permissions
  canAssignMembers: { type: Boolean, default: false },
  
  // Delete Permissions
  canDeleteTasks: { type: Boolean, default: false },
  canDeleteProjects: { type: Boolean, default: false },

  // Task Editing Permissions
  canEditPriority: { type: Boolean, default: false },
  canEditDates: { type: Boolean, default: false },
  canManageAttachments: { type: Boolean, default: false },

  // Management Permissions
  canManageRoles: { type: Boolean, default: false },
  canManageUsers: { type: Boolean, default: false },
  canManageSystem: { type: Boolean, default: false },
  // Delegated administration of the Access & Permissions module itself.
  // Lets an Admin grant a custom role (or, via a personal AccessOverride,
  // a single user) the ability to manage other users' access without
  // making them a full Admin. See modules/permissions/permissionEngine.js.
  canManageAccessControl: { type: Boolean, default: false }
}, { _id: false });

/**
 * Role Schema
 * Supports both predefined (system) roles and custom roles
 */
const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Role name is required'],
    trim: true,
    maxlength: [50, 'Role name cannot exceed 50 characters']
  },
  // Lowercase version for internal use and comparisons. Uniqueness is
  // enforced by the compound { workspaceId, slug } index below, not here —
  // a workspace-scoped index is what lets two different workspaces each
  // have their own "team-lead" custom role.
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  // null = global system-role template (admin/manager/hr/employee), shared
  // by every workspace. A real value = a custom role scoped to exactly that
  // workspace. See modules/workspaces/workspaceScopePlugin.js.
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    default: ''
  },
  // Permissions for this role
  permissions: {
    type: permissionSchema,
    default: () => ({})
  },
  // System roles cannot be edited or deleted (admin, manager, employee, hr)
  isSystem: {
    type: Boolean,
    default: false
  },
  // Track who created custom roles
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient queries. { workspaceId, slug } replaces the old
// standalone-unique slug index — Mongo treats `null` as a normal value for
// uniqueness, so this still guarantees exactly one global
// { workspaceId: null, slug: 'admin' } template while allowing each
// workspace its own custom slugs.
roleSchema.index({ workspaceId: 1, slug: 1 }, { unique: true });
roleSchema.index({ isSystem: 1 });
roleSchema.index({ isActive: 1 });
roleSchema.index({ createdAt: -1 });

roleSchema.plugin(workspaceScopePlugin, { allowGlobal: true });

// Pre-save hook to generate slug from name
roleSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  next();
});

// The one lookup every "resolve this acting user's role" call site should
// use instead of a bare findOne({slug}) — matches either this workspace's
// own custom role, or the global system-role template, by slug.
roleSchema.statics.findResolvable = function (slug, workspaceId) {
  return this.findOne({
    slug,
    isActive: true,
    $or: [{ workspaceId: workspaceId || null }, { workspaceId: null, isSystem: true }]
  });
};

// Static method to get default permissions for system roles
roleSchema.statics.getDefaultPermissions = function(roleSlug) {
  const permissions = {
    admin: {
      canCreateDepartment: true,
      canCreateTask: true,
      canCreateProject: true,
      canCreateAnnouncement: true,
      canCreateReminder: true,
      canAssignMembers: true,
      canDeleteTasks: true,
      canDeleteProjects: true,
      canEditPriority: true,
      canEditDates: true,
      canManageAttachments: true,
      canManageRoles: true,
      canManageUsers: true,
      canManageSystem: true,
      canManageAccessControl: true
    },
    manager: {
      canCreateDepartment: false,
      canCreateTask: true,
      canCreateProject: true,
      canCreateAnnouncement: true,
      canCreateReminder: true,
      canAssignMembers: true,
      canDeleteTasks: true,
      canDeleteProjects: true,
      canEditPriority: true,
      canEditDates: true,
      canManageAttachments: true,
      canManageAccessControl: false
    },
    hr: {
      canCreateDepartment: true,
      canCreateTask: true,
      canCreateProject: false,
      canCreateAnnouncement: true,
      canCreateReminder: true,
      canAssignMembers: true,
      canDeleteTasks: false,
      canDeleteProjects: false,
      canEditPriority: true,
      canEditDates: true,
      canManageAttachments: false
    },
    employee: {
      canCreateDepartment: false,
      canCreateTask: true,
      canCreateProject: false,
      canCreateAnnouncement: false,
      canCreateReminder: true,
      canAssignMembers: false,
      canDeleteTasks: false,
      canDeleteProjects: false,
      canEditPriority: false,
      canEditDates: false,
      canManageAttachments: false
    }
  };
  
  return permissions[roleSlug] || permissions.employee;
};

// Virtual to count users with this role
roleSchema.virtual('userCount', {
  ref: 'User',
  localField: 'slug',
  foreignField: 'role',
  count: true
});

export default mongoose.model('Role', roleSchema);

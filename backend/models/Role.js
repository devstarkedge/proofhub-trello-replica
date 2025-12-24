import mongoose from 'mongoose';

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

  // Management Permissions
  canManageRoles: { type: Boolean, default: false },
  canManageUsers: { type: Boolean, default: false },
  canManageSystem: { type: Boolean, default: false }
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
  // Lowercase version for internal use and comparisons
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
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

// Indexes for efficient queries
roleSchema.index({ slug: 1 });
roleSchema.index({ isSystem: 1 });
roleSchema.index({ isActive: 1 });
roleSchema.index({ createdAt: -1 });

// Pre-save hook to generate slug from name
roleSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  next();
});

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
      canAssignMembers: true,
      canDeleteTasks: true,
      canDeleteProjects: true,
      canManageRoles: true,
      canManageUsers: true,
      canManageSystem: true
    },
    manager: {
      canCreateDepartment: false,
      canCreateTask: true,
      canCreateProject: true,
      canCreateAnnouncement: true,
      canCreateReminder: true,
      canAssignMembers: true,
      canDeleteTasks: true,
      canDeleteProjects: true
    },
    hr: {
      canCreateDepartment: true,
      canCreateTask: true,
      canCreateProject: false,
      canCreateAnnouncement: true,
      canCreateReminder: true,
      canAssignMembers: true,
      canDeleteTasks: false,
      canDeleteProjects: false
    },
    employee: {
      canCreateDepartment: false,
      canCreateTask: true,
      canCreateProject: false,
      canCreateAnnouncement: false,
      canCreateReminder: true,
      canAssignMembers: false,
      canDeleteTasks: false,
      canDeleteProjects: false
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

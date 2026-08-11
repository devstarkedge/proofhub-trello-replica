import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const salesPermissionSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  // Uniqueness moved to the compound { workspaceId, user } index below — a
  // standalone unique here would block the same user having independent
  // Sales access in two different workspaces.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  moduleVisible: {
    type: Boolean,
    default: false
  },
  canCreate: {
    type: Boolean,
    default: false
  },
  canUpdate: {
    type: Boolean,
    default: false
  },
  canDelete: {
    type: Boolean,
    default: false
  },
  canExport: {
    type: Boolean,
    default: false
  },
  canImport: {
    type: Boolean,
    default: false
  },
  canManageDropdowns: {
    type: Boolean,
    default: false
  },
  canViewActivityLog: {
    type: Boolean,
    default: true // Most users can view history
  },
  moduleAccessNotifiedAt: {
    type: Date,
    default: null
  },
  // Admin who set the permissions
  grantedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Index for fast permission checks
salesPermissionSchema.index({ workspaceId: 1, user: 1 }, { unique: true });
salesPermissionSchema.index({ workspaceId: 1, user: 1, moduleVisible: 1 });

salesPermissionSchema.plugin(workspaceScopePlugin);

// Static method to check if user has permission
salesPermissionSchema.statics.hasPermission = async function(userId, permissionName) {
  const permission = await this.findOne({ user: userId, moduleVisible: true });
  if (!permission) return false;
  return permission[permissionName] === true;
};

// Static method to get user permissions or return default (no access)
salesPermissionSchema.statics.getUserPermissions = async function(userId) {
  const permission = await this.findOne({ user: userId });
  if (!permission) {
    return {
      moduleVisible: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canExport: false,
      canImport: false,
      canManageDropdowns: false,
      canViewActivityLog: false
    };
  }
  return permission;
};

export default mongoose.model('SalesPermission', salesPermissionSchema);

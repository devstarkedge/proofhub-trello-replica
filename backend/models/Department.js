import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const departmentSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  // Uniqueness is enforced by the compound { workspaceId, name } index below,
  // not here — two different workspaces can each have their own "Engineering".
  name: {
    type: String,
    required: [true, 'Department name is required'],
    trim: true,
    maxlength: [50, 'Department name cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  managers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  projects: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes — workspaceId leads every compound, matching the convention
// department/board already followed for their own children.
departmentSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
departmentSchema.index({ workspaceId: 1, isActive: 1 });
departmentSchema.index({ workspaceId: 1, isActive: 1, name: 1 }); // active dept lookup sorted by name
departmentSchema.index({ workspaceId: 1, members: 1, isActive: 1 }); // user's departments
departmentSchema.index({ workspaceId: 1, managers: 1, isActive: 1 }); // manager's departments

departmentSchema.plugin(workspaceScopePlugin);

export default mongoose.model('Department', departmentSchema);

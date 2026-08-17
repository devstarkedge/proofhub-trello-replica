import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const projectDropdownOptionSchema = new mongoose.Schema({
  // null = global system option (e.g. Hourly Rate, Milestone), shared by
  // every workspace. A real value = a custom option scoped to exactly that
  // workspace. See modules/workspaces/workspaceScopePlugin.js's allowGlobal.
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    default: null
  },
  type: {
    type: String,
    required: [true, 'Option type is required'],
    enum: ['projectSource', 'billingType'],
    index: true
  },
  value: {
    type: String,
    required: [true, 'Option value is required'],
    trim: true
  },
  label: {
    type: String,
    required: [true, 'Option label is required'],
    trim: true
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isSystem: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

projectDropdownOptionSchema.index({ workspaceId: 1, type: 1, value: 1 }, { unique: true });
projectDropdownOptionSchema.index({ workspaceId: 1, type: 1, displayOrder: 1 });
projectDropdownOptionSchema.index({ workspaceId: 1, type: 1, isActive: 1 });

projectDropdownOptionSchema.plugin(workspaceScopePlugin, { allowGlobal: true });

export default mongoose.model('ProjectDropdownOption', projectDropdownOptionSchema);

import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const categorySchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
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

// Indexes
// Partial: only active categories are constrained, so a soft-deleted
// category's name doesn't permanently block reuse in the same department
// (deleteCategory sets isActive:false rather than removing the document).
categorySchema.index(
  { workspaceId: 1, department: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
categorySchema.index({ workspaceId: 1, department: 1 });
categorySchema.index({ workspaceId: 1, createdBy: 1 });
categorySchema.index({ workspaceId: 1, isActive: 1 });

categorySchema.plugin(workspaceScopePlugin);

export default mongoose.model('Category', categorySchema);

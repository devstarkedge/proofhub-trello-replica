import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const listSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  title: {
    type: String,
    required: [true, 'List title is required'],
    trim: true,
    maxlength: [100, 'List title cannot exceed 100 characters']
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true
  },
  position: {
    type: Number,
    required: true,
    default: 0
  },
  color: {
    type: String,
    default: null
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
listSchema.index({ workspaceId: 1, board: 1, position: 1 });
listSchema.index({ workspaceId: 1, isArchived: 1 });

listSchema.plugin(workspaceScopePlugin);

export default mongoose.model('List', listSchema);
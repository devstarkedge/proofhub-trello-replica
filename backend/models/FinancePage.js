import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

/**
 * FinancePage Model
 * Custom child pages created by Admins/Managers
 * Features:
 * - User-specific pages (creator visibility)
 * - Admin approval workflow
 * - Custom column selection
 * - Default filters
 */
const financePageSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  // Page basic info
  name: {
    type: String,
    required: true,
    trim: true,
    maxLength: 100
  },
  description: {
    type: String,
    trim: true,
    maxLength: 500
  },
  
  // Page type (users or projects based)
  pageType: {
    type: String,
    enum: ['users', 'projects'],
    required: true,
    default: 'users'
  },
  
  // Selected columns configuration
  columns: [{
    key: String,
    label: String,
    visible: { type: Boolean, default: true },
    order: Number
  }],
  
  // Default filters for this page
  defaultFilters: {
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    datePreset: { type: String, enum: ['today', 'thisWeek', 'thisMonth', 'thisYear', 'custom'] },
    startDate: Date,
    endDate: Date,
    billingType: { type: String, enum: ['hr', 'hourly', 'fixed', 'milestone', 'all'] },
    projectSource: String
  },
  
  // Creator and ownership
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Approval status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Admin who approved/rejected
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  
  // Visibility
  isPublic: {
    type: Boolean,
    default: false // Becomes true when approved by Admin
  },
  
  // Ordering for display
  order: {
    type: Number,
    default: 0
  },
  
  // Soft delete
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient queries
financePageSchema.index({ workspaceId: 1, createdBy: 1, isArchived: 1 });
financePageSchema.index({ workspaceId: 1, status: 1, isArchived: 1 });
financePageSchema.index({ workspaceId: 1, isPublic: 1, isArchived: 1 });

financePageSchema.plugin(workspaceScopePlugin);

const FinancePage = mongoose.model('FinancePage', financePageSchema);

export default FinancePage;

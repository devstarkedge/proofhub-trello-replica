import mongoose from 'mongoose';

const salesActivityLogSchema = new mongoose.Schema({
  salesRow: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesRow',
    required: [true, 'Sales row reference is required'],
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: ['created', 'updated', 'deleted', 'restored', 'locked', 'unlocked'],
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  // For update actions - track what changed
  changes: [{
    field: {
      type: String,
      required: true
    },
    fieldLabel: {
      type: String,
      required: true
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed
    }
  }],
  // IP address and user agent for security
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false } // Only need createdAt for logs
});

// Compound indexes for efficient queries
salesActivityLogSchema.index({ salesRow: 1, createdAt: -1 });
salesActivityLogSchema.index({ user: 1, createdAt: -1 });
salesActivityLogSchema.index({ action: 1, createdAt: -1 });

// TTL index - automatically delete logs older than 1 year (optional, can be removed)
// salesActivityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });

// Static method to log activity
salesActivityLogSchema.statics.logActivity = async function(data) {
  const {
    salesRow,
    user,
    action,
    description,
    changes = [],
    ipAddress = null,
    userAgent = null
  } = data;
  
  return await this.create({
    salesRow,
    user,
    action,
    description,
    changes,
    ipAddress,
    userAgent
  });
};

// Static method to get formatted change description
salesActivityLogSchema.statics.formatChangeDescription = function(changes) {
  if (!changes || changes.length === 0) return '';
  
  return changes.map(change => {
    const oldVal = change.oldValue !== null && change.oldValue !== undefined ? change.oldValue : 'Empty';
    const newVal = change.newValue !== null && change.newValue !== undefined ? change.newValue : 'Empty';
    return `${change.fieldLabel}: "${oldVal}" → "${newVal}"`;
  }).join('; ');
};

export default mongoose.model('SalesActivityLog', salesActivityLogSchema);

import mongoose from 'mongoose';

const salesRowSchema = new mongoose.Schema({
  // Predefined columns
  date: {
    type: Date,
    required: [true, 'Date is required'],
    index: true
  },
  monthName: {
    type: String,
    trim: true
  },
  bidLink: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Bid Link must be a valid URL'
    }
  },
  platform: {
    type: String,
    required: [true, 'Platform is required'],
    trim: true,
    index: true
  },
  profile: {
    type: String,
    trim: true
  },
  technology: {
    type: String,
    required: [true, 'Technology is required'],
    trim: true,
    index: true
  },
  clientRating: {
    type: Number,
    min: [0.5, 'Rating must be at least 0.5'],
    max: [5, 'Rating must not exceed 5']
  },
  clientHireRate: {
    type: Number,
    min: [0, 'Hire rate must be at least 0%'],
    max: [100, 'Hire rate must not exceed 100%']
  },
  clientBudget: {
    type: String,
    trim: true
  },
  clientSpending: {
    type: String,
    trim: true
  },
  clientLocation: {
    type: String,
    trim: true
  },
  replyFromClient: {
    type: String,
    trim: true
  },
  followUps: {
    type: String,
    trim: true
  },
  followUpDate: {
    type: Date
  },
  connects: {
    type: Number,
    min: [0, 'Connects must be a positive number']
  },
  rate: {
    type: Number,
    min: [0, 'Rate must be a positive number']
  },
  proposalScreenshot: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Proposal Screenshot must be a valid URL'
    }
  },
  status: {
    type: String,
    trim: true,
    index: true
  },
  comments: {
    type: String,
    trim: true
  },
  
  // Custom columns - dynamic key-value pairs
  customFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  
  // Row metadata
  rowColor: {
    type: String,
    default: '#FFFFFF',
    trim: true
  },
  
  // Locking mechanism for multi-user editing
  lockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lockedAt: {
    type: Date,
    default: null
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
salesRowSchema.index({ date: -1 });
salesRowSchema.index({ platform: 1, date: -1 });
salesRowSchema.index({ technology: 1, date: -1 });
salesRowSchema.index({ status: 1, date: -1 });
salesRowSchema.index({ createdBy: 1 });
salesRowSchema.index({ isDeleted: 1, date: -1 });

// Compound index for common queries
salesRowSchema.index({ isDeleted: 1, platform: 1, status: 1, date: -1 });

// Pre-save hook to auto-generate month name from date
salesRowSchema.pre('save', function(next) {
  if (this.date && (!this.monthName || this.isModified('date'))) {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    this.monthName = monthNames[this.date.getMonth()];
  }
  next();
});

// Method to check if row is locked
salesRowSchema.methods.isLocked = function() {
  if (!this.lockedBy || !this.lockedAt) return false;
  
  // Auto-unlock after 10 minutes of inactivity
  const lockDuration = 10 * 60 * 1000; // 10 minutes
  const now = new Date();
  return (now - this.lockedAt) < lockDuration;
};

// Method to acquire lock
salesRowSchema.methods.acquireLock = function(userId) {
  if (this.isLocked() && this.lockedBy.toString() !== userId.toString()) {
    return false;
  }
  this.lockedBy = userId;
  this.lockedAt = new Date();
  return true;
};

// Method to release lock
salesRowSchema.methods.releaseLock = function(userId) {
  if (this.lockedBy && this.lockedBy.toString() === userId.toString()) {
    this.lockedBy = null;
    this.lockedAt = null;
    return true;
  }
  return false;
};

export default mongoose.model('SalesRow', salesRowSchema);

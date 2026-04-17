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
    required: [true, 'Month is required'],
    trim: true,
    default: ''
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    index: true
  },
  bidLink: {
    type: {
      type: String,
      enum: {
        values: ['link', 'invite', 'direct'],
        message: 'Bid type must be link, invite, or direct'
      },
      required: [true, 'Bid type is required']
    },
    url: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: function (v) {
          const bidType = this?.bidLink?.type ?? this?.parent?.()?.bidLink?.type;
          if (bidType === 'direct') return !v;
          if (bidType === 'link') return v && /^https?:\/\/.+/.test(v);
          // invite: URL is optional (null allowed for imported legacy data)
          if (bidType === 'invite' && v) return /^https?:\/\/.+/.test(v);
          return true;
        },
        message: function () {
          const bidType = this?.bidLink?.type ?? this?.parent?.()?.bidLink?.type;
          if (bidType === 'direct') return 'Direct bids must not have a URL';
          if (bidType === 'link') return 'A valid URL is required for link bids';
          return 'Invalid URL format';
        }
      }
    },
    isValid: {
      type: Boolean,
      default: true
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
    required: [true, 'Profile is required'],
    trim: true,
    default: ''
  },
  technology: {
    type: String,
    required: [true, 'Technology is required'],
    trim: true,
    index: true
  },
  clientRating: {
    type: Number,
    min: [0, 'Rating must be at least 0'],
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
    default: '',
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
salesRowSchema.index({ clientLocation: 1, date: -1 });
salesRowSchema.index({ profile: 1, date: -1 });

// Compound index for common queries
salesRowSchema.index({ isDeleted: 1, platform: 1, status: 1, date: -1 });
salesRowSchema.index({ isDeleted: 1, platform: 1, status: 1, technology: 1, date: -1 });
salesRowSchema.index({ name: 1, date: -1 });
salesRowSchema.index({ isDeleted: 1, name: 1, date: -1 });
salesRowSchema.index({ 'bidLink.type': 1, date: -1 });
salesRowSchema.index({ 'bidLink.isValid': 1, date: -1 });

// Pre-validate hook to auto-generate month name from date (must run before validation
// so the required monthName field is set when date is present)
salesRowSchema.pre('validate', function(next) {
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

import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
  emoji: {
    type: String,
    required: true,
    enum: ['👍', '❤️', '🎉', '🔥', '👀']
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  count: {
    type: Number,
    default: 0
  }
});

const commentSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Enhanced attachment schema for Cloudinary
const attachmentSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  url: {
    type: String,
    required: true
  },
  public_id: {
    type: String,
    required: true
  },
  resource_type: {
    type: String,
    enum: ['image', 'raw'],
    required: true
  },
  format: {
    type: String,
    required: true
  },
  file_size: {
    type: Number,
    required: true
  },
  original_name: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  width: {
    type: Number,
    default: null
  },
  height: {
    type: Number,
    default: null
  },
  thumbnail_url: {
    type: String,
    default: null
  },
  preview_url: {
    type: String,
    default: null
  },
  file_hash: {
    type: String,
    default: null
  },
  tag: {
    type: String,
    enum: ['notice', 'holiday', 'exam', 'general', 'policy', 'other'],
    default: 'general'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
});

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Announcement title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Announcement description is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['HR', 'General', 'Urgent', 'System Update', 'Events', 'Custom'],
    default: 'General',
    required: true
  },
  customCategory: {
    type: String,
    trim: true,
    maxlength: [50, 'Custom category cannot exceed 50 characters']
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subscribers: {
    type: {
      type: String,
      enum: ['all', 'departments', 'users', 'managers', 'custom'],
      default: 'all'
    },
    departments: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    }],
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    roles: [{
      type: String,
      enum: ['admin', 'manager', 'hr', 'employee']
    }]
  },
  attachments: [attachmentSchema],
  reactions: [reactionSchema],
  comments: [commentSchema],
  commentsCount: {
    type: Number,
    default: 0
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  pinPosition: {
    type: Number,
    min: 1,
    max: 3
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  isScheduled: {
    type: Boolean,
    default: false
  },
  scheduleBroadcasted: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true
  },
  lastFor: {
    value: {
      type: Number,
      required: true
    },
    unit: {
      type: String,
      enum: ['hours', 'days', 'weeks', 'months'],
      required: true
    }
  },
  allowComments: {
    type: Boolean,
    default: true
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date,
    default: null
  },
  broadcastedAt: {
    type: Date,
    default: null
  },
  broadcastedTo: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  viewCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for optimal query performance
announcementSchema.index({ createdBy: 1, createdAt: -1 });
announcementSchema.index({ 'subscribers.users': 1 });
announcementSchema.index({ 'subscribers.departments': 1 });
announcementSchema.index({ isPinned: 1, createdAt: -1 });
announcementSchema.index({ isArchived: 1, expiresAt: 1 });
announcementSchema.index({ isScheduled: 1, scheduledFor: 1 });
announcementSchema.index({ category: 1, createdAt: -1 });
announcementSchema.index({ expiresAt: 1 });
announcementSchema.index({ createdAt: -1 });

// Virtual for calculating remaining time
announcementSchema.virtual('remainingTime').get(function() {
  if (this.isArchived) return null;
  const now = new Date();
  const remaining = this.expiresAt - now;
  if (remaining <= 0) return 0;
  return remaining;
});

// Virtual for total reaction count
announcementSchema.virtual('totalReactions').get(function() {
  return this.reactions.reduce((sum, r) => sum + r.count, 0);
});

// Pre-save hook to update timestamps
announcementSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate hook
announcementSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

export default mongoose.model('Announcement', announcementSchema);

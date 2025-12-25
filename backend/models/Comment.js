import mongoose from 'mongoose';

// Reaction schema for emoji reactions
const reactionSchema = new mongoose.Schema({
  emoji: {
    type: String,
    required: true,
    enum: ['👍', '❤️', '😂', '🚀', '😮', '😢']
  },
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  count: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Enhanced mention schema with support for @User, @Role, @Team
const mentionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['user', 'role', 'team'],
    default: 'user'
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  targetModel: {
    type: String,
    enum: ['User', 'Role', 'Team'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  notified: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Edit history entry for version tracking
const editHistorySchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  editedAt: {
    type: Date,
    default: Date.now
  },
  editedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { _id: false });

// Attachment schema for comment attachments
const attachmentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  public_id: {
    type: String,
    required: true
  },
  original_name: {
    type: String,
    required: true
  },
  file_size: {
    type: Number,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  thumbnail_url: {
    type: String,
    default: null
  },
  resource_type: {
    type: String,
    enum: ['image', 'video', 'raw'],
    default: 'raw'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const commentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: false,
    trim: true,
    default: '',
    maxlength: [10000, 'Comment cannot exceed 10000 characters']
  },
  htmlContent: {
    type: String,
    required: true,
    trim: true
  },
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    required: true
  },
  subtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtask'
  },
  subtaskNano: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubtaskNano'
  },
  contextType: {
    type: String,
    enum: ['card', 'subtask', 'subtaskNano', 'announcement'],
    default: 'card'
  },
  contextRef: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Threading support
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true
  },
  threadDepth: {
    type: Number,
    default: 0,
    max: 3
  },
  replyCount: {
    type: Number,
    default: 0
  },

  // Reactions
  reactions: [reactionSchema],

  // Pinning
  isPinned: {
    type: Boolean,
    default: false,
    index: true
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  pinnedAt: {
    type: Date
  },

  // Enhanced mentions (backward compatible)
  mentions: [mentionSchema],

  // Legacy mentions for backward compatibility
  legacyMentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    notified: {
      type: Boolean,
      default: false
    }
  }],

  // Attachments
  attachments: [attachmentSchema],

  // Edit tracking
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  editHistory: {
    type: [editHistorySchema],
    default: [],
    validate: [arrayLimit, 'Edit history exceeds maximum of 10 entries']
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Validator for edit history limit
function arrayLimit(val) {
  return val.length <= 10;
}

// Indexes for optimal query performance
commentSchema.index({ card: 1, createdAt: -1 });
commentSchema.index({ contextRef: 1, createdAt: -1 });
commentSchema.index({ user: 1 });
commentSchema.index({ parentComment: 1, createdAt: 1 }); // For fetching thread replies
commentSchema.index({ isPinned: -1, createdAt: -1 }); // For pinned comments first
commentSchema.index({ 'mentions.targetId': 1 }); // For mention lookup
commentSchema.index({ contextRef: 1, isPinned: -1, parentComment: 1, createdAt: -1 }); // Compound index for comment listing

// Virtual for checking if comment has replies
commentSchema.virtual('hasReplies').get(function() {
  return this.replyCount > 0;
});

// Virtual for total reaction count
commentSchema.virtual('totalReactions').get(function() {
  return this.reactions.reduce((sum, r) => sum + r.count, 0);
});

// Parse mentions from htmlContent into structured mentions array
commentSchema.pre('save', function(next) {
  if (!this.isModified('htmlContent')) return next();

  // Regex to match mention links: <a data-id="..." data-type="user|role|team">@Name</a>
  const mentionRegex = /<a[^>]*?data-id=["']([^"']+)["'][^>]*?(?:data-type=["']([^"']+)["'])?[^>]*?>(?:@)?([^<]*)<\/a>/g;
  const mentions = [];
  let m;

  while ((m = mentionRegex.exec(this.htmlContent || '')) !== null) {
    const targetId = m[1];
    const mentionType = m[2] || 'user';
    const name = m[3] || '';
    
    if (targetId && mongoose.Types.ObjectId.isValid(targetId)) {
      // Determine target model based on type
      let targetModel = 'User';
      if (mentionType === 'role') targetModel = 'Role';
      else if (mentionType === 'team') targetModel = 'Team';

      mentions.push({
        type: mentionType,
        targetId,
        targetModel,
        name,
        notified: false
      });
    }
  }

  this.mentions = mentions;
  next();
});

// Pre-save hook to maintain edit history
commentSchema.pre('save', function(next) {
  if (this.isModified('htmlContent') && !this.isNew && this._previousHtmlContent) {
    // Add previous version to history
    if (this.editHistory.length >= 10) {
      this.editHistory.shift(); // Remove oldest entry
    }
    this.editHistory.push({
      content: this._previousText || '',
      htmlContent: this._previousHtmlContent,
      editedAt: new Date(),
      editedBy: this._editedBy || this.user
    });
  }
  next();
});

// Static method to get paginated comments with pinned first
commentSchema.statics.getPaginatedComments = async function(query, options = {}) {
  const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = -1 } = options;
  const skip = (page - 1) * limit;

  // Get pinned comments first
  const pinnedComments = await this.find({ ...query, isPinned: true, parentComment: null })
    .populate('user', 'name avatar')
    .populate('pinnedBy', 'name')
    .sort({ pinnedAt: -1 })
    .lean();

  // Get non-pinned comments with pagination
  const regularComments = await this.find({ ...query, isPinned: false, parentComment: null })
    .populate('user', 'name avatar')
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .lean();

  // Get total count for pagination
  const total = await this.countDocuments({ ...query, parentComment: null });

  return {
    comments: [...pinnedComments, ...regularComments],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    }
  };
};

// Static method to get threaded replies
commentSchema.statics.getReplies = async function(parentCommentId, options = {}) {
  const { page = 1, limit = 10 } = options;
  const skip = (page - 1) * limit;

  const replies = await this.find({ parentComment: parentCommentId })
    .populate('user', 'name avatar')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await this.countDocuments({ parentComment: parentCommentId });

  return {
    replies,
    pagination: {
      page,
      limit,
      total,
      hasMore: page * limit < total
    }
  };
};

// Instance method to add reaction
commentSchema.methods.addReaction = async function(userId, emoji) {
  const existingReaction = this.reactions.find(r => r.emoji === emoji);
  
  if (existingReaction) {
    // Check if user already reacted with this emoji
    if (existingReaction.users.some(u => u.toString() === userId.toString())) {
      return false; // Already reacted
    }
    existingReaction.users.push(userId);
    existingReaction.count += 1;
  } else {
    this.reactions.push({
      emoji,
      users: [userId],
      count: 1
    });
  }
  
  await this.save();
  return true;
};

// Instance method to remove reaction
commentSchema.methods.removeReaction = async function(userId, emoji) {
  const existingReaction = this.reactions.find(r => r.emoji === emoji);
  
  if (!existingReaction) return false;
  
  const userIndex = existingReaction.users.findIndex(u => u.toString() === userId.toString());
  if (userIndex === -1) return false;
  
  existingReaction.users.splice(userIndex, 1);
  existingReaction.count = Math.max(0, existingReaction.count - 1);
  
  // Remove reaction entry if no users left
  if (existingReaction.count === 0) {
    this.reactions = this.reactions.filter(r => r.emoji !== emoji);
  }
  
  await this.save();
  return true;
};

// Instance method to pin comment
commentSchema.methods.pin = async function(userId) {
  this.isPinned = true;
  this.pinnedBy = userId;
  this.pinnedAt = new Date();
  await this.save();
};

// Instance method to unpin comment
commentSchema.methods.unpin = async function() {
  this.isPinned = false;
  this.pinnedBy = undefined;
  this.pinnedAt = undefined;
  await this.save();
};

export default mongoose.model('Comment', commentSchema);
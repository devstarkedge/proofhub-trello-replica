import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  // File information
  fileName: {
    type: String,
    required: true,
    trim: true,
    maxlength: [255, 'File name cannot exceed 255 characters']
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  fileType: {
    type: String,
    required: true,
    enum: ['image', 'pdf', 'document', 'spreadsheet', 'presentation', 'video', 'text', 'other']
  },
  mimeType: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: [0, 'File size cannot be negative']
  },

  // Cloudinary information
  url: {
    type: String,
    required: true
  },
  secureUrl: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true,
    index: true
  },
  resourceType: {
    type: String,
    enum: ['image', 'video', 'raw', 'auto'],
    default: 'auto'
  },
  format: {
    type: String
  },

  // Thumbnail URLs for images
  thumbnailUrl: {
    type: String
  },
  previewUrl: {
    type: String
  },

  // Context - what this attachment belongs to
  contextType: {
    type: String,
    required: true,
    enum: ['card', 'subtask', 'subtaskNano', 'nanoSubtask', 'comment', 'description'],
    index: true
  },
  contextRef: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  
  // Relations
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    index: true
  },
  subtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtask',
    index: true
  },
  nanoSubtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubtaskNano',
    index: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    index: true
  },
  comment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  },

  // Upload metadata
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },

  // Additional metadata
  width: Number,
  height: Number,
  duration: Number, // For videos
  pages: Number, // For PDFs/documents
  
  // Flags
  isCover: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Trash + restore metadata
  restoredAt: Date,
  restoredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  originalContext: {
    type: mongoose.Schema.Types.Mixed
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },

  // Enhanced trash metadata for precise restore
  originalContext: {
    type: mongoose.Schema.Types.Mixed,
    description: 'Stores exact location metadata for restore: { departmentId, projectId, parentType, parentId, section, commentId, indexPosition }'
  },

  // Restore tracking
  restoredAt: {
    type: Date,
    description: 'When attachment was last restored from trash'
  },
  restoredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    description: 'User who restored the attachment'
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
attachmentSchema.index({ card: 1, isDeleted: 1, createdAt: -1 });
attachmentSchema.index({ contextType: 1, contextRef: 1, isDeleted: 1 });
attachmentSchema.index({ board: 1, isDeleted: 1, createdAt: -1 });
attachmentSchema.index({ uploadedBy: 1, createdAt: -1 });
attachmentSchema.index({ fileType: 1, createdAt: -1 });
attachmentSchema.index({ board: 1, isDeleted: 1, deletedAt: -1 });
attachmentSchema.index({ board: 1, deletedAt: -1, fileType: 1 });

// Virtual for formatted file size
attachmentSchema.virtual('formattedSize').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Pre-save middleware to ensure soft delete consistency
attachmentSchema.pre('save', function(next) {
  if (this.isDeleted && !this.deletedAt) {
    this.deletedAt = new Date();
  }
  next();
});

// Static method to find active attachments for a card
attachmentSchema.statics.findByCard = function(cardId, options = {}) {
  const query = { card: cardId, isDeleted: false };
  const projection = options.lean ? null : undefined;
  
  let q = this.find(query)
    .populate('uploadedBy', 'name avatar')
    .sort({ createdAt: -1 });
    
  if (options.limit) {
    q = q.limit(options.limit);
  }
  if (options.skip) {
    q = q.skip(options.skip);
  }
  if (options.lean) {
    q = q.lean();
  }
  
  return q;
};

// Static method to find active attachments by context
attachmentSchema.statics.findByContext = function(contextType, contextRef, options = {}) {
  const query = { contextType, contextRef, isDeleted: false };
  
  let q = this.find(query)
    .populate('uploadedBy', 'name avatar')
    .sort({ createdAt: -1 });
    
  if (options.limit) q = q.limit(options.limit);
  if (options.skip) q = q.skip(options.skip);
  if (options.lean) q = q.lean();
  
  return q;
};

// Static method to find attachments by subtask
attachmentSchema.statics.findBySubtask = function(subtaskId, options = {}) {
  const query = { subtask: subtaskId, isDeleted: false };
  
  let q = this.find(query)
    .populate('uploadedBy', 'name avatar')
    .sort({ createdAt: -1 });
    
  if (options.limit) q = q.limit(options.limit);
  if (options.skip) q = q.skip(options.skip);
  if (options.lean) q = q.lean();
  
  return q;
};

// Static method to find attachments by nano-subtask
attachmentSchema.statics.findByNanoSubtask = function(nanoSubtaskId, options = {}) {
  const query = { nanoSubtask: nanoSubtaskId, isDeleted: false };
  
  let q = this.find(query)
    .populate('uploadedBy', 'name avatar')
    .sort({ createdAt: -1 });
    
  if (options.limit) q = q.limit(options.limit);
  if (options.skip) q = q.skip(options.skip);
  if (options.lean) q = q.lean();
  
  return q;
};

// Instance method to soft delete
attachmentSchema.methods.softDelete = async function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

export default mongoose.model('Attachment', attachmentSchema);

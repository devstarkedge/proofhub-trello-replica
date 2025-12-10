import mongoose from 'mongoose';

const versionHistorySchema = new mongoose.Schema({
  // What entity this version belongs to
  entityType: {
    type: String,
    required: true,
    enum: ['card_description', 'comment', 'subtask_description'],
    index: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  // Version information
  versionNumber: {
    type: Number,
    required: true,
    min: 1
  },

  // Content at this version
  content: {
    type: String,
    required: true
  },
  htmlContent: {
    type: String
  },

  // Mentions at this version (for comments and descriptions)
  mentions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String
  }],

  // Edit metadata
  editedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  editedAt: {
    type: Date,
    default: Date.now
  },

  // Context information
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    index: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    index: true
  },

  // Edit summary/reason (optional)
  editSummary: {
    type: String,
    maxlength: [500, 'Edit summary cannot exceed 500 characters']
  },

  // Change tracking
  changeType: {
    type: String,
    enum: ['created', 'edited', 'rollback'],
    default: 'edited'
  },
  previousVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VersionHistory'
  },

  // For rollback tracking
  rolledBackFrom: {
    type: Number // Version number that was rolled back from
  },
  rolledBackTo: {
    type: Number // Version number that was rolled back to
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
versionHistorySchema.index({ entityType: 1, entityId: 1, versionNumber: -1 });
versionHistorySchema.index({ entityType: 1, entityId: 1, isDeleted: 1 });
versionHistorySchema.index({ card: 1, entityType: 1, createdAt: -1 });
versionHistorySchema.index({ editedBy: 1, createdAt: -1 });

// Static method to get version history for an entity
versionHistorySchema.statics.getVersionHistory = function(entityType, entityId, options = {}) {
  const query = { entityType, entityId, isDeleted: false };
  
  let q = this.find(query)
    .populate('editedBy', 'name avatar email')
    .sort({ versionNumber: -1 });
    
  if (options.limit) q = q.limit(options.limit);
  if (options.skip) q = q.skip(options.skip);
  if (options.lean) q = q.lean();
  
  return q;
};

// Static method to get a specific version
versionHistorySchema.statics.getVersion = function(entityType, entityId, versionNumber) {
  return this.findOne({
    entityType,
    entityId,
    versionNumber,
    isDeleted: false
  }).populate('editedBy', 'name avatar email');
};

// Static method to get the latest version number
versionHistorySchema.statics.getLatestVersionNumber = async function(entityType, entityId) {
  const latest = await this.findOne({
    entityType,
    entityId,
    isDeleted: false
  }).sort({ versionNumber: -1 }).select('versionNumber').lean();
  
  return latest ? latest.versionNumber : 0;
};

// Static method to create a new version
versionHistorySchema.statics.createVersion = async function(data) {
  const {
    entityType,
    entityId,
    content,
    htmlContent,
    mentions,
    editedBy,
    card,
    board,
    editSummary,
    changeType = 'edited'
  } = data;

  // Get the latest version number
  const latestVersionNumber = await this.getLatestVersionNumber(entityType, entityId);
  const newVersionNumber = latestVersionNumber + 1;

  // Get previous version ID if exists
  let previousVersionId = null;
  if (latestVersionNumber > 0) {
    const previousVersion = await this.findOne({
      entityType,
      entityId,
      versionNumber: latestVersionNumber
    }).select('_id').lean();
    previousVersionId = previousVersion?._id;
  }

  const version = new this({
    entityType,
    entityId,
    versionNumber: newVersionNumber,
    content,
    htmlContent,
    mentions,
    editedBy,
    card,
    board,
    editSummary,
    changeType,
    previousVersionId
  });

  return version.save();
};

// Static method to rollback to a specific version
versionHistorySchema.statics.rollbackToVersion = async function(entityType, entityId, targetVersionNumber, userId, board, card) {
  // Get the target version
  const targetVersion = await this.getVersion(entityType, entityId, targetVersionNumber);
  if (!targetVersion) {
    throw new Error('Target version not found');
  }

  // Get current version number
  const currentVersionNumber = await this.getLatestVersionNumber(entityType, entityId);

  // Create a new version representing the rollback
  const rollbackVersion = await this.createVersion({
    entityType,
    entityId,
    content: targetVersion.content,
    htmlContent: targetVersion.htmlContent,
    mentions: targetVersion.mentions,
    editedBy: userId,
    card,
    board,
    editSummary: `Rolled back from version ${currentVersionNumber} to version ${targetVersionNumber}`,
    changeType: 'rollback'
  });

  // Update rollback tracking
  rollbackVersion.rolledBackFrom = currentVersionNumber;
  rollbackVersion.rolledBackTo = targetVersionNumber;
  await rollbackVersion.save();

  return {
    rollbackVersion,
    restoredContent: targetVersion.content,
    restoredHtmlContent: targetVersion.htmlContent
  };
};

// Static method to get version count
versionHistorySchema.statics.getVersionCount = function(entityType, entityId) {
  return this.countDocuments({ entityType, entityId, isDeleted: false });
};

// Virtual for time since edit
versionHistorySchema.virtual('timeSinceEdit').get(function() {
  const now = new Date();
  const diff = now - this.editedAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

export default mongoose.model('VersionHistory', versionHistorySchema);

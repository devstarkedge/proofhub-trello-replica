import mongoose from 'mongoose';
import crypto from 'crypto';

// Encryption helpers for secure token storage
const ENCRYPTION_KEY = process.env.SLACK_TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return null;
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Token decryption failed:', error);
    return null;
  }
}

const slackWorkspaceSchema = new mongoose.Schema({
  // Slack workspace identifiers
  teamId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  teamName: {
    type: String,
    required: true
  },
  teamDomain: {
    type: String
  },
  teamIcon: {
    type: String
  },

  // Bot credentials (encrypted)
  botAccessTokenEncrypted: {
    type: String,
    required: true
  },
  botUserId: {
    type: String,
    required: true
  },
  botId: {
    type: String
  },

  // OAuth scope
  scope: {
    type: String
  },

  // Enterprise Grid support
  enterpriseId: {
    type: String
  },
  enterpriseName: {
    type: String
  },
  isEnterpriseInstall: {
    type: Boolean,
    default: false
  },

  // App installation details
  appId: {
    type: String,
    required: true
  },
  installedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  installedAt: {
    type: Date,
    default: Date.now
  },

  // Default notification channel
  defaultChannelId: {
    type: String
  },
  defaultChannelName: {
    type: String
  },

  // Multi-tenant mapping
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  },
  departments: [{
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department'
    },
    channelId: {
      type: String
    },
    channelName: {
      type: String
    }
  }],
  teams: [{
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    },
    channelId: {
      type: String
    },
    channelName: {
      type: String
    }
  }],

  // Workspace-level settings
  settings: {
    // Notification controls
    notificationsEnabled: { type: Boolean, default: true },
    threadedNotifications: { type: Boolean, default: true },
    
    // Batching settings
    batchingEnabled: { type: Boolean, default: true },
    batchIntervalMinutes: { type: Number, default: 5, min: 1, max: 60 },
    
    // Digest settings
    digestEnabled: { type: Boolean, default: true },
    digestFrequency: { 
      type: String, 
      enum: ['hourly', 'daily', 'weekly'], 
      default: 'daily' 
    },
    digestTime: { type: String, default: '09:00' }, // 24-hour format
    digestTimezone: { type: String, default: 'UTC' },
    
    // Quiet hours (global default)
    quietHoursEnabled: { type: Boolean, default: false },
    quietHoursStart: { type: String, default: '22:00' },
    quietHoursEnd: { type: String, default: '08:00' },
    quietHoursTimezone: { type: String, default: 'UTC' },
    
    // Rate limiting
    maxNotificationsPerMinute: { type: Number, default: 50 },
    
    // Feature toggles
    slashCommandsEnabled: { type: Boolean, default: true },
    interactiveActionsEnabled: { type: Boolean, default: true },
    appHomeEnabled: { type: Boolean, default: true },
    
    // Role-based notification routing
    adminNotifications: {
      systemAlerts: { type: Boolean, default: true },
      approvalRequests: { type: Boolean, default: true },
      highLevelReports: { type: Boolean, default: true },
      userRegistrations: { type: Boolean, default: true }
    },
    managerNotifications: {
      progressUpdates: { type: Boolean, default: true },
      performanceAlerts: { type: Boolean, default: true },
      delayWarnings: { type: Boolean, default: true },
      teamActivity: { type: Boolean, default: true }
    },
    memberNotifications: {
      taskAssignments: { type: Boolean, default: true },
      taskUpdates: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      mentions: { type: Boolean, default: true },
      reminders: { type: Boolean, default: true }
    }
  },

  // Health monitoring
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  },
  healthStatus: {
    type: String,
    enum: ['healthy', 'degraded', 'unhealthy'],
    default: 'healthy'
  },
  lastHealthCheck: {
    type: Date
  },
  consecutiveFailures: {
    type: Number,
    default: 0
  },

  // Webhook URL for incoming webhooks (if configured)
  incomingWebhookUrl: {
    type: String
  },
  incomingWebhookChannel: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
slackWorkspaceSchema.index({ teamId: 1, isActive: 1 });
slackWorkspaceSchema.index({ 'departments.departmentId': 1 });
slackWorkspaceSchema.index({ 'teams.teamId': 1 });
slackWorkspaceSchema.index({ installedBy: 1 });
slackWorkspaceSchema.index({ isActive: 1, healthStatus: 1 });

// Virtual for decrypted bot token
slackWorkspaceSchema.virtual('botAccessToken').get(function() {
  return decrypt(this.botAccessTokenEncrypted);
});

// Method to set encrypted token
slackWorkspaceSchema.methods.setBotAccessToken = function(token) {
  this.botAccessTokenEncrypted = encrypt(token);
};

// Method to verify workspace health
slackWorkspaceSchema.methods.markHealthy = function() {
  this.healthStatus = 'healthy';
  this.consecutiveFailures = 0;
  this.lastHealthCheck = new Date();
  this.lastActivityAt = new Date();
};

slackWorkspaceSchema.methods.markFailure = function() {
  this.consecutiveFailures += 1;
  this.lastHealthCheck = new Date();
  
  if (this.consecutiveFailures >= 10) {
    this.healthStatus = 'unhealthy';
  } else if (this.consecutiveFailures >= 3) {
    this.healthStatus = 'degraded';
  }
};

// Static method to find workspace by team ID
slackWorkspaceSchema.statics.findByTeamId = function(teamId) {
  return this.findOne({ teamId, isActive: true });
};

// Static method to find workspace for a department
slackWorkspaceSchema.statics.findByDepartment = function(departmentId) {
  return this.findOne({
    'departments.departmentId': departmentId,
    isActive: true
  });
};

// Pre-save hook for activity tracking
slackWorkspaceSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.lastActivityAt = new Date();
  }
  next();
});

export default mongoose.model('SlackWorkspace', slackWorkspaceSchema);
export { encrypt, decrypt };

import mongoose from 'mongoose';

const reminderHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created', 'sent', 'completed', 'missed', 'rescheduled', 'cancelled'],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  notificationSent: {
    email: { type: Boolean, default: false },
    inApp: { type: Boolean, default: false }
  }
}, { _id: true });

const reminderSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: [true, 'Project is required'],
    index: true
  },
  client: {
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    }
  },
  scheduledDate: {
    type: Date,
    required: [true, 'Scheduled date is required'],
    index: true
  },
  frequency: {
    type: String,
    enum: ['one-time', 'every-3-days', 'weekly', 'custom'],
    default: 'one-time'
  },
  customIntervalDays: {
    type: Number,
    min: 1,
    max: 365
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'completed', 'missed', 'cancelled'],
    default: 'pending',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  reminderCount: {
    type: Number,
    default: 0
  },
  maxReminders: {
    type: Number,
    default: 3
  },
  lastSentAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notificationSentAt: {
    type: Date
  },
  emailSentAt: {
    type: Date
  },
  awaitingClientResponse: {
    type: Boolean,
    default: false
  },
  history: [reminderHistorySchema],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Compound indexes for optimized queries
reminderSchema.index({ project: 1, status: 1 });
reminderSchema.index({ department: 1, status: 1 });
reminderSchema.index({ scheduledDate: 1, status: 1 });
reminderSchema.index({ createdBy: 1, status: 1 });
reminderSchema.index({ 'client.email': 1 });
reminderSchema.index({ awaitingClientResponse: 1, department: 1 });
reminderSchema.index({ createdAt: -1 });

// Virtual for checking if reminder is overdue
reminderSchema.virtual('isOverdue').get(function() {
  return this.status === 'pending' && new Date() > this.scheduledDate;
});

// Virtual for checking if reminder is due soon (within 24 hours)
reminderSchema.virtual('isDueSoon').get(function() {
  if (this.status !== 'pending') return false;
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return this.scheduledDate <= tomorrow && this.scheduledDate > now;
});

// Method to add history entry
reminderSchema.methods.addHistoryEntry = function(action, userId, notes = '') {
  this.history.push({
    action,
    performedBy: userId,
    notes,
    timestamp: new Date()
  });
};

// Method to mark as completed
reminderSchema.methods.markCompleted = function(userId, notes = '') {
  this.status = 'completed';
  this.completedAt = new Date();
  this.completedBy = userId;
  this.addHistoryEntry('completed', userId, notes);
};

// Method to mark as sent
reminderSchema.methods.markSent = function(emailSent = false, inAppSent = false) {
  this.status = 'sent';
  this.lastSentAt = new Date();
  this.reminderCount += 1;
  
  // Check if max reminders reached without response
  if (this.reminderCount >= this.maxReminders) {
    this.awaitingClientResponse = true;
  }
  
  this.history.push({
    action: 'sent',
    performedBy: this.createdBy,
    timestamp: new Date(),
    notificationSent: { email: emailSent, inApp: inAppSent }
  });
};

// Static method to get dashboard stats
reminderSchema.statics.getDashboardStats = async function(filters = {}) {
  const query = {};
  
  if (filters.department) query.department = filters.department;
  if (filters.createdBy) query.createdBy = filters.createdBy;
  if (filters.project) query.project = filters.project;
  
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  
  const [stats] = await this.aggregate([
    { $match: query },
    {
      $facet: {
        upcoming: [
          { $match: { status: 'pending', scheduledDate: { $gte: now } } },
          { $count: 'count' }
        ],
        dueSoon: [
          { $match: { status: 'pending', scheduledDate: { $gte: now, $lte: tomorrow } } },
          { $count: 'count' }
        ],
        overdue: [
          { $match: { status: 'pending', scheduledDate: { $lt: now } } },
          { $count: 'count' }
        ],
        completed: [
          { $match: { status: 'completed' } },
          { $count: 'count' }
        ],
        missed: [
          { $match: { status: 'missed' } },
          { $count: 'count' }
        ],
        total: [
          { $count: 'count' }
        ],
        awaitingResponse: [
          { $match: { awaitingClientResponse: true } },
          { $count: 'count' }
        ]
      }
    }
  ]);
  
  const getCount = (arr) => arr[0]?.count || 0;
  
  const completed = getCount(stats.completed);
  const total = getCount(stats.total);
  const successRatio = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  return {
    upcoming: getCount(stats.upcoming),
    dueSoon: getCount(stats.dueSoon),
    overdue: getCount(stats.overdue),
    completed,
    missed: getCount(stats.missed),
    total,
    awaitingResponse: getCount(stats.awaitingResponse),
    successRatio
  };
};

// Static method to get reminders by date range for calendar
reminderSchema.statics.getCalendarReminders = async function(startDate, endDate, filters = {}) {
  const query = {
    scheduledDate: { $gte: startDate, $lte: endDate }
  };
  
  if (filters.department) query.department = filters.department;
  if (filters.project) query.project = filters.project;
  
  return this.find(query)
    .populate('project', 'name')
    .populate('createdBy', 'name avatar')
    .select('scheduledDate status client.name project notes')
    .sort({ scheduledDate: 1 })
    .lean();
};

export default mongoose.model('Reminder', reminderSchema);

import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';
const mentionSchema = new mongoose.Schema({
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
});

const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimetype: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isCover: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const cardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Card title is required'],
    trim: true,
    maxlength: [200, 'Card title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  descriptionMentions: [mentionSchema],
  list: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'List',
    required: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true
  },
  position: {
    type: Number,
    required: true,
    default: 0
  },
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  labels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Label'
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical', null]
  },
  status: {
    type: String
  },
  isCover: {
    type: Boolean,
    default: false
  },
  coverImage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attachment',
    default: null
  },
  dueDate: {
    type: Date
  },
  startDate: {
    type: Date
  },
  subtaskStats: {
    total: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    nanoTotal: { type: Number, default: 0 },
    nanoCompleted: { type: Number, default: 0 }
  },
  attachments: [attachmentSchema],
  estimationTime: [new mongoose.Schema({
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    reason: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, trim: true }, // Denormalized for display without population
    date: { type: Date, default: Date.now }
  }, { _id: true })],
  loggedTime: [new mongoose.Schema({
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, trim: true }, // Denormalized for display without population
    date: { type: Date, default: Date.now }
  }, { _id: true })],
  billedTime: [new mongoose.Schema({
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, trim: true }, // Denormalized for display without population
    date: { type: Date, default: Date.now }
  }, { _id: true })],
  isArchived: {
    type: Boolean,
    default: false
  },
  archivedAt: {
    type: Date,
    default: null
  },
  autoDeleteAt: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdFrom: {
    type: String,
    enum: ['calendar', 'project', 'board', 'slack', 'api', null],
    default: null
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

// Indexes
cardSchema.index({ list: 1, position: 1 });
cardSchema.index({ board: 1 });
cardSchema.index({ assignees: 1 });
cardSchema.index({ members: 1 });
cardSchema.index({ status: 1 });
cardSchema.index({ priority: 1 });
cardSchema.index({ dueDate: 1 });
cardSchema.index({ isArchived: 1 });
cardSchema.index({ createdBy: 1 });
cardSchema.index({ board: 1, status: 1 });
cardSchema.index({ board: 1, dueDate: 1 });
cardSchema.index({ board: 1, priority: 1 });
cardSchema.index({ createdAt: -1 });
cardSchema.index({ updatedAt: -1 });
cardSchema.index({ startDate: 1 });
cardSchema.index({ isArchived: 1, autoDeleteAt: 1 });
cardSchema.index({ 'estimationTime.user': 1 });
cardSchema.index({ 'loggedTime.user': 1 });

// Additional optimized indexes for common query patterns
cardSchema.index({ assignees: 1, status: 1 }); // For user task filtering by status
cardSchema.index({ assignees: 1, dueDate: 1 }); // For user overdue tasks
cardSchema.index({ assignees: 1, priority: 1 }); // For user priority filtering
cardSchema.index({ members: 1, status: 1 }); // For member task filtering
cardSchema.index({ board: 1, isArchived: 1 }); // For active board cards
cardSchema.index({ dueDate: 1, status: 1 }); // For overdue task queries
cardSchema.index({ priority: 1, dueDate: 1 }); // For priority + deadline sorting
cardSchema.index({ createdBy: 1, createdAt: -1 }); // For user-created tasks timeline

// New compound indexes for optimized queries
cardSchema.index({ list: 1, isArchived: 1, position: 1 }); // For list cards with position sorting
cardSchema.index({ board: 1, list: 1, status: 1 }); // For board filtering by list and status
cardSchema.index({ board: 1, list: 1, position: 1 }); // For board cards sorted by position
cardSchema.index({ 'assignees': 1, 'dueDate': 1, 'status': 1 }); // For user overdue dashboard
cardSchema.index({ board: 1, assignees: 1 }); // For project member tasks
cardSchema.index({ board: 1, members: 1 }); // For project member involvement
// Text index for search
cardSchema.index({ title: 'text', description: 'text', labels: 'text' }, {
  weights: { title: 10, labels: 5, description: 1 },
  name: 'card_text_search'
});

// Virtual for comments
cardSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'card'
});

cardSchema.virtual('subtasks', {
  ref: 'Subtask',
  localField: '_id',
  foreignField: 'task'
});

// Calculate progress based on subtasks
cardSchema.virtual('progress').get(function() {
  if (this.subtaskStats && this.subtaskStats.total > 0) {
    return Math.round((this.subtaskStats.completed / this.subtaskStats.total) * 100);
  }
  if (!this.subtasks || this.subtasks.length === 0) return 0;
  const completed = this.subtasks.filter(st => st.completed || st.status === 'done').length;
  return Math.round((completed / this.subtasks.length) * 100);
});

// Calculate total logged time
cardSchema.virtual('totalLoggedTime').get(function() {
  if (!this.loggedTime || this.loggedTime.length === 0) return { hours: 0, minutes: 0 };

  let totalMinutes = 0;
  this.loggedTime.forEach(log => {
    totalMinutes += (log.hours * 60) + log.minutes;
  });

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { hours, minutes };
});

// Add pagination plugin
cardSchema.plugin(mongoosePaginate);

export default mongoose.model('Card', cardSchema);

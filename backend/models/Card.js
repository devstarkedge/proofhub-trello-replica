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

// ─── Indexes ────────────────────────────────────────────────────────────────
// Redundant single-field indexes removed — covered by compound prefixes.
// See: https://www.mongodb.com/docs/manual/core/index-compound/#prefixes

// Core position/list ordering
cardSchema.index({ list: 1, position: 1 });

// Standalone fields only kept where no compound has them as prefix
cardSchema.index({ status: 1 });            // Calendar/kanban queries filter on status alone
cardSchema.index({ createdAt: -1 });
cardSchema.index({ updatedAt: -1 });
cardSchema.index({ startDate: 1 });
cardSchema.index({ 'estimationTime.user': 1 });
cardSchema.index({ 'loggedTime.user': 1 });

// Board-leading compounds (covers standalone { board: 1 })
cardSchema.index({ board: 1, status: 1 });
cardSchema.index({ board: 1, dueDate: 1 });
cardSchema.index({ board: 1, priority: 1 });
cardSchema.index({ board: 1, isArchived: 1 });
cardSchema.index({ board: 1, list: 1, status: 1 });
cardSchema.index({ board: 1, list: 1, position: 1 });
cardSchema.index({ board: 1, assignees: 1 });
cardSchema.index({ board: 1, members: 1 });

// Assignee-leading compounds (covers standalone { assignees: 1 })
cardSchema.index({ assignees: 1, status: 1 });
cardSchema.index({ assignees: 1, dueDate: 1 });
cardSchema.index({ assignees: 1, priority: 1 });
cardSchema.index({ assignees: 1, dueDate: 1, status: 1 });

// Member compound (covers standalone { members: 1 })
cardSchema.index({ members: 1, status: 1 });

// Date/priority compounds (covers standalone { dueDate: 1 }, { priority: 1 })
cardSchema.index({ dueDate: 1, status: 1 });
cardSchema.index({ priority: 1, dueDate: 1 });

// Creator + time compound (covers standalone { createdBy: 1 })
cardSchema.index({ createdBy: 1, createdAt: -1 });

// Archive compound (covers standalone { isArchived: 1 })
cardSchema.index({ isArchived: 1, autoDeleteAt: 1 });
cardSchema.index({ list: 1, isArchived: 1, position: 1 });

// Text index for search
cardSchema.index({ title: 'text', description: 'text', labels: 'text' }, {
  weights: { title: 10, labels: 5, description: 1 },
  name: 'card_text_search',
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

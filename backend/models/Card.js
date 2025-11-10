import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const subtaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
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
    type: String,
    trim: true
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical']
  },
  status: {
    type: String
  },
  isCover: {
    type: Boolean,
    default: false
  },
  dueDate: {
    type: Date
  },
  startDate: {
    type: Date
  },
  subtasks: [subtaskSchema],
  attachments: [attachmentSchema],
  estimationTime: [{
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    reason: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
  }],
  loggedTime: [{
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
  }],
  isArchived: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
cardSchema.index({ 'estimationTime.user': 1 });
cardSchema.index({ 'loggedTime.user': 1 });

// Virtual for comments
cardSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'card'
});

// Calculate progress based on subtasks
cardSchema.virtual('progress').get(function() {
  if (!this.subtasks || this.subtasks.length === 0) return 0;
  const completed = this.subtasks.filter(st => st.completed).length;
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

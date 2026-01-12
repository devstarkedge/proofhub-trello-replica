import mongoose from 'mongoose';

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
}, { _id: false });

const subtaskSchema = new mongoose.Schema({
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    required: true,
    index: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
    index: true
  },
  list: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'List'
  },
  title: {
    type: String,
    required: [true, 'Subtask title is required'],
    trim: true,
    maxlength: [200, 'Subtask title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  status: {
    type: String,
    default: 'todo',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical', null],
    default: 'medium'
  },
  assignees: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Label'
  }],
  dueDate: {
    type: Date
  },
  startDate: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  attachments: [attachmentSchema],
  coverImage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attachment'
  },
  estimationTime: [new mongoose.Schema({
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    reason: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, trim: true }, // Denormalized for display
    date: { type: Date, default: Date.now }
  }, { _id: true })],
  loggedTime: [new mongoose.Schema({
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, trim: true }, // Denormalized for display
    date: { type: Date, default: Date.now }
  }, { _id: true })],
  billedTime: [new mongoose.Schema({
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, trim: true }, // Denormalized for display
    date: { type: Date, default: Date.now }
  }, { _id: true })],
  order: {
    type: Number,
    default: 0
  },
  colorToken: {
    type: String,
    default: 'purple'
  },
  commentsCount: {
    type: Number,
    default: 0
  },
  nanoCount: {
    type: Number,
    default: 0
  },
  breadcrumbs: {
    project: {
      type: String,
      trim: true
    },
    task: {
      type: String,
      trim: true
    }
  },
  // Recurring task fields
  isRecurring: {
    type: Boolean,
    default: false,
    index: true
  },
  recurringTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecurringTask'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

subtaskSchema.virtual('nanoSubtasks', {
  ref: 'SubtaskNano',
  localField: '_id',
  foreignField: 'subtask',
  justOne: false
});

subtaskSchema.index({ task: 1, order: 1 });
subtaskSchema.index({ board: 1, status: 1 });
subtaskSchema.index({ assignees: 1, status: 1 });
subtaskSchema.index({ dueDate: 1 });
subtaskSchema.index({ isRecurring: 1, recurringTaskId: 1 });

export default mongoose.model('Subtask', subtaskSchema);


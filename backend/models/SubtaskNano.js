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

const subtaskNanoSchema = new mongoose.Schema({
  subtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtask',
    required: true,
    index: true
  },
  task: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    required: true
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true
  },
  title: {
    type: String,
    required: [true, 'Subtask-Nano title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  status: {
    type: String,
    default: 'todo'
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
  dueDate: {
    type: Date
  },
  startDate: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true
  }],
  attachments: [attachmentSchema],
  estimationTime: [{
    id: { type: String, required: true },
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    reason: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
  }],
  loggedTime: [{
    id: { type: String, required: true },
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
  }],
  billedTime: [{
    id: { type: String, required: true },
    hours: { type: Number, required: true, min: 0 },
    minutes: { type: Number, required: true, min: 0, max: 59 },
    description: { type: String, trim: true, maxlength: 500 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
  }],
  order: {
    type: Number,
    default: 0
  },
  colorToken: {
    type: String,
    default: 'pink'
  },
  breadcrumbs: {
    project: { type: String, trim: true },
    task: { type: String, trim: true },
    subtask: { type: String, trim: true }
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
  timestamps: true
});

subtaskNanoSchema.index({ subtask: 1, order: 1 });
subtaskNanoSchema.index({ board: 1, status: 1 });
subtaskNanoSchema.index({ assignees: 1, status: 1 });
subtaskNanoSchema.index({ dueDate: 1 });

export default mongoose.model('SubtaskNano', subtaskNanoSchema);


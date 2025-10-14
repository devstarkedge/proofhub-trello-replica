import { Schema, model } from 'mongoose';

const cardSchema = new Schema({
  listId: {
    type: Schema.Types.ObjectId,
    ref: 'List',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  position: {
    type: Number,
    default: 0
  },
  labels: [
    {
      type: String,
    },
  ],
  members: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Medium',
  },
  subtasks: [
    {
      title: String,
      completed: {
        type: Boolean,
        default: false,
      },
    },
  ],
  attachments: [
    {
      type: String, // URL to the file
    },
  ],
  comments: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Comment',
    },
  ],
  dueDate: {
    type: Date,
    default: null
  },
  assignee: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  status: {
    type: String,
    enum: ['To-Do', 'In Progress', 'Review', 'Done'],
    default: 'To-Do',
  },
  reminders: [
    {
      offset: Number, // days before dueDate
      sent: {
        type: Boolean,
        default: false,
      },
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default model('Card', cardSchema);

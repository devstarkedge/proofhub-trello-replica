import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    trim: true,
      maxlength: [10000, 'Comment cannot exceed 10000 characters']
  },
    htmlContent: {
      type: String,
      required: true,
      trim: true
    },
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Card',
    required: true
  },
  subtask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtask'
  },
  subtaskNano: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubtaskNano'
  },
  contextType: {
    type: String,
    enum: ['card', 'subtask', 'subtaskNano'],
    default: 'card'
  },
  contextRef: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
    mentions: [{
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
    }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
commentSchema.index({ card: 1, createdAt: -1 });
commentSchema.index({ contextRef: 1, createdAt: -1 });
commentSchema.index({ user: 1 });

// Parse mentions from htmlContent into structured mentions array
commentSchema.pre('save', function(next) {
  if (!this.isModified('htmlContent')) return next();

  const mentionRegex = /<a[^>]*?data-id=["']([^"']+)["'][^>]*?>(?:@)?([^<]*)<\/a>/g;
  const mentions = [];
  let m;

  while ((m = mentionRegex.exec(this.htmlContent || '')) !== null) {
    const userId = m[1];
    const name = m[2] || '';
    if (userId) {
      mentions.push({ userId, name, notified: false });
    }
  }

  this.mentions = mentions;
  next();
});

export default mongoose.model('Comment', commentSchema);
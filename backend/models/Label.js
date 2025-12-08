import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Label name is required'],
    trim: true,
    maxlength: [50, 'Label name cannot exceed 50 characters']
  },
  color: {
    type: String,
    required: [true, 'Label color is required'],
    default: '#3B82F6',
    validate: {
      validator: function(v) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(v);
      },
      message: props => `${props.value} is not a valid hex color!`
    }
  },
  board: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient lookup by board and name (to prevent duplicates)
labelSchema.index({ board: 1, name: 1 }, { unique: true });

// Index for fast retrieval by board
labelSchema.index({ board: 1, createdAt: -1 });

// Pre-save hook to update timestamp
labelSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Label = mongoose.model('Label', labelSchema);

export default Label;

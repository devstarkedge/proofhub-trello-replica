import mongoose from 'mongoose';

const salesColumnSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Column name is required'],
    trim: true,
    maxlength: [50, 'Column name cannot exceed 50 characters']
  },
  key: {
    type: String,
    required: [true, 'Column key is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  type: {
    type: String,
    required: [true, 'Column type is required'],
    enum: ['dropdown', 'date', 'text', 'link', 'number'],
    default: 'text'
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  isRequired: {
    type: Boolean,
    default: false
  },
  // For dropdown type columns - reference to dropdown options
  hasDropdownOptions: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
salesColumnSchema.index({ displayOrder: 1 });
salesColumnSchema.index({ isVisible: 1 });

// Pre-save hook to generate key from name if not provided
salesColumnSchema.pre('save', function(next) {
  if (!this.key && this.name) {
    // Generate a URL-friendly key from the name
    this.key = this.name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }
  
  // Set hasDropdownOptions based on type
  if (this.type === 'dropdown') {
    this.hasDropdownOptions = true;
  }
  
  next();
});

export default mongoose.model('SalesColumn', salesColumnSchema);

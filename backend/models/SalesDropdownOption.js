import mongoose from 'mongoose';

const salesDropdownOptionSchema = new mongoose.Schema({
  columnName: {
    type: String,
    required: [true, 'Column name is required'],
    trim: true,
    index: true
  },
  value: {
    type: String,
    required: [true, 'Option value is required'],
    trim: true
  },
  label: {
    type: String,
    required: [true, 'Option label is required'],
    trim: true
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    trim: true,
    default: '#6B7280' // Default gray color
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Compound unique index - same value cannot exist twice for the same column
salesDropdownOptionSchema.index({ columnName: 1, value: 1 }, { unique: true });

// Index for ordering
salesDropdownOptionSchema.index({ columnName: 1, displayOrder: 1 });

// Index for active options
salesDropdownOptionSchema.index({ columnName: 1, isActive: 1 });

export default mongoose.model('SalesDropdownOption', salesDropdownOptionSchema);

import mongoose from 'mongoose';

const projectDropdownOptionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: [true, 'Option type is required'],
    enum: ['projectSource', 'billingType'],
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

projectDropdownOptionSchema.index({ type: 1, value: 1 }, { unique: true });
projectDropdownOptionSchema.index({ type: 1, displayOrder: 1 });
projectDropdownOptionSchema.index({ type: 1, isActive: 1 });

export default mongoose.model('ProjectDropdownOption', projectDropdownOptionSchema);

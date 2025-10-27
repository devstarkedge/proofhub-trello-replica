import mongoose from 'mongoose';

const boardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Board name is required'],
    trim: true,
    maxlength: [100, 'Board name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public'
  },
  background: {
    type: String,
    default: '#6366f1'
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  startDate: {
    type: Date
  },
  dueDate: {
    type: Date
  },
  labels: [{
    type: String
  }],
  estimatedTime: {
    type: String
  },
  status: {
    type: String,
    enum: ['planning', 'in-progress', 'completed', 'on-hold'],
    default: 'planning'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  projectUrl: {
    type: String,
    trim: true
  },
  projectSource: {
    type: String,
    enum: ['Upwork', 'Direct', 'Contra']
  },
  upworkId: {
    type: String,
    trim: true
  },
  billingCycle: {
    type: String,
    enum: ['hr', 'fixed']
  },
  fixedPrice: {
    type: Number
  },
  hourlyPrice: {
    type: Number
  },
  clientDetails: {
    clientName: {
      type: String,
      trim: true
    },
    clientEmail: {
      type: String,
      trim: true
    },
    clientWhatsappNumber: {
      type: String,
      trim: true
    }
  },
  projectCategory: {
    type: String,
    trim: true
  },
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalname: {
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
    path: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
boardSchema.index({ team: 1 });
boardSchema.index({ department: 1 });
boardSchema.index({ owner: 1 });
boardSchema.index({ members: 1 });
boardSchema.index({ isArchived: 1 });

export default mongoose.model('Board', boardSchema);

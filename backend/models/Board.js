import { Schema, model } from 'mongoose';

const boardSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
  },
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'private',
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default model('Board', boardSchema);

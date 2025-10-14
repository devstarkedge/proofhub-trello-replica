import { Schema, model } from 'mongoose';

const departmentSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  teams: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model('Department', departmentSchema);

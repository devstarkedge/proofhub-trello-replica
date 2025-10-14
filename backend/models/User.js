import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['Admin', 'Manager', 'Member'],
    default: 'Member',
  },
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
  },
  avatar: {
    type: String, // URL to avatar image
    default: '',
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  invites: [
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

export default model('User', userSchema);

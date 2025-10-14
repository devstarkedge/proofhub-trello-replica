import { Schema, model } from 'mongoose';

const teamSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  department: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
  },
  inviteTokens: [
    {
      token: String,
      email: String,
      expiresAt: Date,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model('Team', teamSchema);

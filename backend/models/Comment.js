import { Schema, model } from 'mongoose';

const commentSchema = new Schema({
  text: {
    type: String,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  card: {
    type: Schema.Types.ObjectId,
    ref: 'Card',
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model('Comment', commentSchema);

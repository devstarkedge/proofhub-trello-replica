import { Schema, model } from 'mongoose';

const listSchema = new Schema({
  boardId: {
    type: Schema.Types.ObjectId,
    ref: 'Board',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  position: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default model('List', listSchema);

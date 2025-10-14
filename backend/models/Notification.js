import { Schema, model } from 'mongoose';

const notificationSchema = new Schema({
  type: {
    type: String,
    enum: ['task_assigned', 'task_due', 'comment_added', 'team_invite', 'reminder'],
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  relatedCard: {
    type: Schema.Types.ObjectId,
    ref: 'Card',
  },
  relatedTeam: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default model('Notification', notificationSchema);

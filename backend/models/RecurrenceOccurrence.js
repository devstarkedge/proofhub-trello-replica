import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recurrence: { type: mongoose.Schema.Types.ObjectId, required: true },
  card: { type: mongoose.Schema.Types.ObjectId, required: true },
  occurrenceKey: { type: String, required: true },
  subtask: { type: mongoose.Schema.Types.ObjectId, required: true }
}, { timestamps: true });
schema.index({ workspaceId: 1, recurrence: 1, occurrenceKey: 1 }, { unique: true });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('RecurrenceOccurrence', schema);

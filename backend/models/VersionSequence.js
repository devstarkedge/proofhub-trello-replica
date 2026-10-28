import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';
const schema = new mongoose.Schema({
  _id: String, workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  value: { type: Number, required: true }
}, { timestamps: true });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('VersionSequence', schema);

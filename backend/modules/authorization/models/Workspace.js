import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isActive: { type: Boolean, default: true },
  settings: {
    restrictDomain: { type: String }, // e.g. "@acme.com" only
  }
}, { timestamps: true });

export default mongoose.model('Workspace', workspaceSchema);

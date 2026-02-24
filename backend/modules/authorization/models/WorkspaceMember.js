import mongoose from 'mongoose';

const workspaceMemberSchema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], // Array supports multiple roles per workspace
  isActive: { type: Boolean, default: true },
  metadata: {
    department: String, // Useful for ABAC/PBAC context evaluation
    title: String
  }
}, { timestamps: true });

// Ensures a user is only invited to a workspace once
workspaceMemberSchema.index({ workspace: 1, user: 1 }, { unique: true });

export default mongoose.model('WorkspaceMember', workspaceMemberSchema);

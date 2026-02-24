import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  action: { type: String, required: true }, // e.g., 'ROLE_UPDATED', 'PERMISSION_ADDED'
  targetType: { type: String, required: true }, // e.g., 'Role', 'WorkspaceMember'
  targetId: { type: mongoose.Schema.Types.ObjectId },
  changes: {
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String
}, { timestamps: true });

export default mongoose.model('AuditLog', auditLogSchema);

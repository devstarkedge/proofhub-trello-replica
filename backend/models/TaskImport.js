import mongoose from 'mongoose';
import workspaceScopePlugin from '../modules/workspaces/workspaceScopePlugin.js';

const rowSchema = new mongoose.Schema({
  rowNumber: Number, values: [String], title: String, description: String,
  statusName: String, startDate: Date, dueDate: Date,
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
  card: mongoose.Schema.Types.ObjectId, field: String, error: String,
  attempts: { type: Number, default: 0 }, warning: String,
}, { _id: false });
const schema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.ObjectId, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, required: true },
  board: { type: mongoose.Schema.Types.ObjectId, required: true },
  department: { type: mongoose.Schema.Types.ObjectId, required: true },
  digest: { type: String, required: true }, fileName: String,
  retryOf: mongoose.Schema.Types.ObjectId,
  active: { type: Boolean, default: false },
  status: { type: String, enum: ['READY', 'QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED'], default: 'READY' },
  rows: [rowSchema], total: Number,
  processed: { type: Number, default: 0 }, successful: { type: Number, default: 0 }, failed: { type: Number, default: 0 },
  leaseOwner: String, leaseUntil: { type: Date, default: () => new Date(0) },
  completedAt: Date, expiresAt: Date,
}, { timestamps: true });
schema.index({ workspaceId: 1, user: 1, board: 1, digest: 1 }, { unique: true });
schema.index({ workspaceId: 1, user: 1, board: 1, active: -1, createdAt: -1 });
schema.index({ status: 1, leaseUntil: 1 });
// One running import per project, including concurrent starts across users.
schema.index({ workspaceId: 1, board: 1, active: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.plugin(workspaceScopePlugin);
export default mongoose.model('TaskImport', schema);

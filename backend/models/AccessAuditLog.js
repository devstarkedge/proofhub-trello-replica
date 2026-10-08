import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, immutable: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorKind: { type: String, default: 'member' },
  action: { type: String, required: true }, targetType: String, targetId: mongoose.Schema.Types.ObjectId,
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  before: mongoose.Schema.Types.Mixed, after: mongoose.Schema.Types.Mixed, reason: String, requestId: String, ip: String, userAgent: String, at: { type: Date, default: Date.now }
});
schema.index({ workspace: 1, at: -1, _id: -1 });
schema.index({ workspace: 1, targetUser: 1, at: -1 });
schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], () => { throw new Error('Access audit is append-only'); });
schema.pre('save', function () { if (!this.isNew) throw new Error('Access audit is append-only'); });
schema.pre('deleteOne', { document: true, query: false }, () => { throw new Error('Access audit is append-only'); });
export default mongoose.model('AccessAuditLog', schema);

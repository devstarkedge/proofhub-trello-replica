import { getActiveWorkspaceId } from '../modules/workspaces/workspaceContext.js';
import { invalidateBusinessReads, readDomains } from './businessReadCache.js';

export default function businessReadInvalidation(schema, { workspaceField = 'workspaceId', userIdentity = false } = {}) {
  const identityFields = ['name', 'email', 'avatar', 'isActive'];
  const writes = ['updateOne', 'updateMany', 'replaceOne', 'findOneAndReplace', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany'];
  // Membership/override writers sometimes address records by _id, without an
  // ambient workspace (e.g. account administration). Capture actual targets.
  if (workspaceField === 'workspace' || userIdentity) schema.pre(writes, async function () {
    const update = this.getUpdate?.();
    if (userIdentity && update && !Object.entries(update).some(([op, fields]) => (op.startsWith('$') ? Object.keys(fields || {}) : [op]).some(field => identityFields.includes(field)))) return;
    const explicit = this.getFilter?.()[workspaceField];
    if (!userIdentity && explicit && (typeof explicit === 'string' || explicit._bsontype === 'ObjectId')) return;
    const records = await this.model.find(this.getFilter()).select(userIdentity ? '_id' : workspaceField).session(this.getOptions?.().session || null).lean();
    this.businessReadTargets = records.map(record => record[userIdentity ? '_id' : workspaceField]);
  });
  schema.pre('save', function () {
    this.$locals.businessReadSkip = !readDomains(this.constructor.modelName).length || !this.isNew && this.modifiedPaths().every(field => ['updatedAt', '__v', 'evidenceRevision', 'lastActivityAt'].includes(field));
  });
  if (userIdentity) schema.pre('save', function () {
    this.$locals.businessIdentityChanged = this.isNew || identityFields.some(field => this.isModified(field));
  });
  async function changed(result) {
    if (this.$locals?.businessReadSkip) return;
    const model = this.model?.modelName || this.constructor?.modelName || this.modelName;
    if (!readDomains(model).length) return;
    if (result && (result.modifiedCount === 0 && !result.upsertedCount || result.deletedCount === 0)) return;
    const update = this.getUpdate?.();
    if (userIdentity) {
      if (this.$locals && this.$locals.businessIdentityChanged === false) return;
      if (update && !Object.entries(update).some(([op, fields]) => (op.startsWith('$') ? Object.keys(fields || {}) : [op]).some(field => identityFields.includes(field)))) return;
    }
    // Liveness fences do not change the displayed reports.
    if (update && !this.getOptions?.().upsert && Object.entries(update).filter(([op]) => op !== '$setOnInsert').every(([op, fields]) =>
      op.startsWith('$') && Object.keys(fields || {}).every(field => ['updatedAt', '__v', 'evidenceRevision', 'lastActivityAt'].includes(field)))) return;
    const document = result?.[workspaceField] ? result : this;
    const workspaceId = workspaceField === '_id' ? document._id || this.getFilter?.()._id :
      document[workspaceField] || this.getFilter?.()[workspaceField] || getActiveWorkspaceId();
    const session = this.getOptions?.().session || this.$session?.();
    if (userIdentity) {
      const { default: Membership } = await import('../models/WorkspaceMembership.js');
      const userIds = this.businessReadTargets || [document._id || this.getFilter?.()._id].filter(Boolean);
      if (userIds.length) {
        const members = await Membership.find({ user: { $in: userIds } }).select('workspace').session(session || null).lean();
        await Promise.all(members.map(member => invalidateBusinessReads(model, member.workspace, session)));
      }
    } else {
      const targets = this.businessReadTargets || [workspaceId];
      await Promise.all([...new Set(targets.filter(Boolean).map(String))].map(target => invalidateBusinessReads(model, target, session)));
    }
  }
  schema.post('save', changed);
  schema.post(writes, changed);
  schema.post('insertMany', async function (docs) {
    if (!readDomains(this.modelName).length) return;
    for (const workspaceId of new Set(docs.map(doc => String(doc[workspaceField] || getActiveWorkspaceId() || '')))) {
      await invalidateBusinessReads(this.modelName, workspaceId, docs[0]?.$session?.());
    }
  });
}

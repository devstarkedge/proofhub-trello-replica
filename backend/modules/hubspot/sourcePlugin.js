import { sourceState } from './domain.js';

const relevant = key => ['clientDetails', 'projectType', 'isDeleted'].some(field => key === field || key.startsWith(`${field}.`));
function applyField(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {};
  cursor[parts.at(-1)] = value;
}

// Embedded outbox: source changes and durable intent commit in ONE MongoDB
// document write. No network calls or external queue publication in these hooks.
export default function hubspotSourcePlugin(schema) {
  schema.add({ hubspotSync: { type: new schema.constructor({
    clientKey: String, version: String, hash: String, emailHash: String, eligible: Boolean,
    status: { type: String, enum: ['pending', 'retrying', 'synced', 'failed', 'blocked', 'not_eligible'] },
    attempts: { type: Number, default: 0 }, nextAttemptAt: Date, lastAttemptAt: Date,
    portalId: String, configVersion: Number, lastSyncedHash: String, lastSyncedAt: Date,
    errorCode: String, error: String,
  }, { _id: false }), default: undefined, select: false } });
  schema.pre('save', function () {
    if (this.isNew || ['clientDetails', 'projectType', 'isDeleted'].some(key => this.isModified(key))) {
      // Existing hydrated documents may have excluded internal state.
      if (!this.isNew && !this.isSelected('hubspotSync')) throw new Error('Select +hubspotSync before saving changed client fields');
      this.hubspotSync = sourceState(this.toObject(), this.hubspotSync?.toObject() || {});
    }
  });
  schema.pre('insertMany', function (next, docs) {
    for (const doc of docs || []) doc.hubspotSync = sourceState(doc);
    next();
  });
  schema.pre(['findOneAndUpdate', 'updateOne'], async function () {
    const update = this.getUpdate() || {};
    const changed = Object.keys(update).filter(k => !k.startsWith('$')).concat(Object.keys(update.$set || {}), Object.keys(update.$unset || {}));
    if (!changed.some(relevant)) return;
    const before = await this.model.findOne(this.getFilter()).select('+hubspotSync').session(this.getOptions().session || null).lean();
    if (!before) return;
    const after = structuredClone(before);
    for (const [key, value] of Object.entries(update)) if (!key.startsWith('$')) applyField(after, key, value);
    for (const [key, value] of Object.entries(update.$set || {})) applyField(after, key, value);
    for (const key of Object.keys(update.$unset || {})) applyField(after, key, undefined);
    update.$set ||= {};
    update.$set.hubspotSync = sourceState(after, before.hubspotSync);
    this.setUpdate(update);
  });
  // Bulk soft-delete/restore is used by FlowTask. Mark every touched source
  // atomically without deriving client payloads from another document.
  schema.pre('updateMany', function () {
    const update = this.getUpdate() || {};
    const fields = { ...update, ...update.$set, ...update.$unset };
    if (Object.keys(fields).some(k => k === 'clientDetails' || k.startsWith('clientDetails.') || k === 'projectType')) {
      throw new Error('Client changes require individual project writes');
    }
    if (Object.hasOwn(fields, 'isDeleted')) {
      update.$set ||= {};
      update.$set['hubspotSync.status'] = fields.isDeleted ? 'not_eligible' : 'pending';
      update.$set['hubspotSync.eligible'] = !fields.isDeleted;
      update.$set['hubspotSync.nextAttemptAt'] = new Date();
    }
  });
}

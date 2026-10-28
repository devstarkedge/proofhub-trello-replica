import mongoose from 'mongoose';
import User from '../../models/User.js';
import WorkspaceMembership from '../../models/WorkspaceMembership.js';
import { getActiveWorkspaceId } from './workspaceContext.js';
import { ErrorResponse } from '../../middleware/errorHandler.js';

const ids = value => [...new Set((Array.isArray(value) ? value : value ? [value] : []).map(item => String(item?._id || item)))];
const fieldValue = (record, field) => Object.hasOwn(record, field) ? record[field] : record.get ? record.get(field) : field.split('.').reduce((value, key) => value?.[key], record);
export default function tenantReferencesPlugin(schema, { members = [], references = {}, parent = null } = {}) {
  async function validate(values, workspaceId, session, changed) {
    if (!workspaceId) throw new ErrorResponse('Workspace required for references', 400);
    for (const field of members.filter(field => changed.has(field))) {
      const valuesToCheck = ids(fieldValue(values, field));
      if (!valuesToCheck.length) continue;
      if (valuesToCheck.some(value => !mongoose.isValidObjectId(value))) throw new ErrorResponse(`Invalid ${field}`, 400);
      const count = await WorkspaceMembership.countDocuments({ workspace: workspaceId, user: { $in: valuesToCheck }, status: 'active' }).session(session || null);
      if (count !== valuesToCheck.length) throw new ErrorResponse(`${field} must refer to active workspace members`, 400);
      if (await User.countDocuments({ _id: { $in: valuesToCheck }, isActive: true }).session(session || null) !== valuesToCheck.length) throw new ErrorResponse(`${field} must refer to active accounts`, 400);
    }
    for (const [field, modelName] of Object.entries(references)) {
      if (!changed.has(field)) continue;
      const valuesToCheck = ids(fieldValue(values, field));
      if (!valuesToCheck.length) continue;
      if (valuesToCheck.some(value => !mongoose.isValidObjectId(value))) throw new ErrorResponse(`Invalid ${field}`, 400);
      // Models are registered by the application. Dynamic import handles isolated entrypoints.
      if (!mongoose.models[modelName]) await import(`../../models/${modelName}.js`);
      const match = { _id: { $in: valuesToCheck }, workspaceId };
      if (['Label', 'Attachment'].includes(modelName) && values.board) match.board = values.board;
      if (await mongoose.model(modelName).countDocuments(match).session(session || null) !== valuesToCheck.length) throw new ErrorResponse(`${field} must belong to this workspace and project`, 400);
    }
    if (parent && [parent.field, 'board', 'task', 'list', 'subtask'].some(field => changed.has(field))) {
      if (!mongoose.models[parent.model]) await import(`../../models/${parent.model}.js`);
      const record = await mongoose.model(parent.model).findOne({ _id: values[parent.field], workspaceId }).select('board task').session(session || null).lean();
      if (!record || String(record.board) !== String(values.board) || parent.model === 'Subtask' && String(record.task) !== String(values.task)) throw new ErrorResponse('Task hierarchy must belong to the same project', 400);
    }
  }
  schema.pre('validate', async function () {
    const changed = new Set([...members, ...Object.keys(references), 'board', 'task', 'list', 'subtask'].filter(field => this.isNew || this.isModified(field)));
    await validate(this, this.workspaceId || getActiveWorkspaceId(), this.$session(), changed);
  });
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], async function () {
    const update = this.getUpdate() || {};
    const changes = { ...Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith('$'))), ...update.$set, ...update.$setOnInsert };
    for (const operator of ['$push', '$addToSet']) for (const [field, value] of Object.entries(update[operator] || {})) changes[field] = value?.$each || value;
    const keys = new Set(Object.keys(changes));
    const guarded = [...members, ...Object.keys(references)];
    for (const field of guarded) if (keys.has(field.split('.')[0])) keys.add(field);
    for (const [operator, value] of Object.entries(update)) {
      if (!operator.startsWith('$')) continue;
      for (const [field, target] of Object.entries(value || {})) {
        if (guarded.some(key => field.startsWith(`${key}.`) || operator === '$rename' && (String(target) === key || String(target).startsWith(`${key}.`)))) throw new ErrorResponse('Reference changes require explicit fields', 400);
      }
    }
    if (!guarded.some(field => keys.has(field))) return;
    const workspaceId = getActiveWorkspaceId() || changes.workspaceId || this.getFilter().workspaceId;
    if (parent && [parent.field, 'board', 'task', 'list', 'subtask'].some(field => keys.has(field)) && this.op === 'updateMany') throw new ErrorResponse('Update hierarchy references individually', 400);
    const previous = this.op === 'updateMany' ? {} : await this.model.findOne(this.getFilter()).select(['board', 'task', 'list', 'subtask', 'workspaceId', parent?.field].filter(Boolean).join(' ')).session(this.getOptions().session || null).lean();
    if (!previous && !this.getOptions().upsert) return;
    await validate({ ...previous, ...changes }, workspaceId, this.getOptions().session, keys);
  });
  const bulkWrite = schema.statics.bulkWrite;
  schema.statics.bulkWrite = function (operations, options) {
    const guarded = [...members, ...Object.keys(references)];
    for (const operation of operations) {
      const value = Object.values(operation)[0];
      const paths = Object.entries(value.update || {}).flatMap(([key, change]) => key.startsWith('$') ? Object.keys(change || {}) : [key]);
      if (operation.insertOne || operation.replaceOne || guarded.some(field => paths.some(key => key === field || key.startsWith(`${field}.`) || field.startsWith(`${key}.`)))) throw new ErrorResponse('Reference changes require validated individual writes', 400);
    }
    return bulkWrite.call(this, operations, options);
  };
}

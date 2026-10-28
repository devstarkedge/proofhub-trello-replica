import { ErrorResponse } from '../../middleware/errorHandler.js';

export default function optimisticWritesPlugin(schema) {
  schema.set('optimisticConcurrency', true);
  schema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function () {
    const expected = this.getOptions().expectedRevision;
    if (expected !== undefined) {
      if (!Number.isSafeInteger(expected) || expected < 0) throw new ErrorResponse('Invalid entity revision', 400);
      this.and([expected === 0 ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] } : { __v: expected }]);
      this._expectsRevision = true;
      delete this.options.expectedRevision;
    }
    const update = this.getUpdate();
    if (!update || Array.isArray(update)) return;
    const direct = Object.fromEntries(Object.entries(update).filter(([key]) => !key.startsWith('$')));
    const operators = Object.fromEntries(Object.entries(update).filter(([key]) => key.startsWith('$')));
    if (Object.hasOwn(direct, '__v') || Object.values(operators).some(value => value && Object.hasOwn(value, '__v'))) throw new ErrorResponse('Entity revision is server managed', 400);
    operators.$set = { ...direct, ...operators.$set };
    operators.$inc = { ...operators.$inc, __v: 1 };
    this.setUpdate(operators);
  });
  schema.post(['findOneAndUpdate', 'updateOne'], function (result) {
    if (this._expectsRevision && (!result || result.matchedCount === 0)) throw new ErrorResponse('This item changed while you were editing it. Refresh and retry.', 409);
  });
}

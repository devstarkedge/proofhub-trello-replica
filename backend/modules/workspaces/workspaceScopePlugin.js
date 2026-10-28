import mongoose from 'mongoose';
import { getActiveContext } from './workspaceContext.js';

// aggregate()'s $match runs as raw MongoDB, with none of Mongoose's
// automatic string->ObjectId casting that find()/count()/etc. get for free —
// a string workspaceId here silently matches zero documents instead of
// erroring, so every id this plugin injects into a pipeline must be cast.
function toObjectId(value) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
}

/**
 * Structural workspace isolation. Applied to every workspace-owned model
 * (see backend/models/*.js — every schema that calls
 * `schema.plugin(workspaceScopePlugin)`).
 *
 * Rationale: this codebase has no central query chokepoint (controllers
 * query Mongoose models directly, 150+ independent call sites), so adding
 * a `workspaceId` filter by hand at every one of them means a single missed
 * site is a silent cross-tenant data leak. Instead, the active workspace is
 * carried in AsyncLocalStorage for the lifetime of a request (set once, in
 * `protect`), and this plugin injects the filter automatically into every
 * find/count/update/delete/aggregate — and throws if a query runs with no
 * active context and no explicit bypass, so a missing scope is a loud crash
 * during development/staging rather than a leak in production.
 *
 * `{ allowGlobal: true }` (used only by Role.js) additionally matches
 * documents with `workspaceId: null` — the global system-role templates
 * every workspace implicitly shares — instead of requiring an exact match.
 *
 * `runUnscoped()` (bypass) is a read-side escape hatch only. On the write
 * side, a new document with no explicit workspaceId and no real ctx.workspaceId
 * always throws — even under bypass — because "this operation is legitimately
 * cross-tenant for reads" is never a valid reason to silently persist an
 * ORPHANED tenant-owned document with no tenant. Code that genuinely needs to
 * create a workspace-owned document from inside an unscoped block must
 * either set `workspaceId` explicitly on the document, or nest a real
 * `workspaceContext.run({ workspaceId }, ...)` around that specific write.
 *
 * Known, deliberate limits (see docs/access-control-migration.md-style
 * companion notes for the workspace migration):
 *  - bulkWrite() bypasses document/query hooks; the model static below
 *    scopes its operations explicitly and prevents tenant reassignment.
 *  - An aggregate()'s own $lookup sub-pipelines are not separately scoped —
 *    safe only because the joined foreign key was itself correctly scoped
 *    at write time (e.g. Card.board only ever points at a same-workspace
 *    Board), not because this plugin reaches into $lookup stages.
 *  - Background workers (BullMQ) run outside any Express request, so there
 *    is no ambient context — they must call workspaceContext.run(...)
 *    themselves, sourcing the workspaceId from their own job payload.
 *  - findOneAndUpdate(..., { upsert: true }) does not run document
 *    validators unless `runValidators: true` is passed — an upsert that
 *    creates a new document is a WRITE for the purposes of the rule above,
 *    so any such call on a workspace-owned model must pass
 *    `runValidators: true` (or otherwise ensure workspaceId is present on
 *    the resulting document) or it will silently skip this plugin entirely.
 */
export default function workspaceScopePlugin(schema, { allowGlobal = false } = {}) {
  schema.statics.bulkWrite = async function (operations, options) {
    const ctx = getActiveContext();
    if (!ctx?.workspaceId && !ctx?.bypass) throw new Error('Bulk writes require workspace context');
    const scoped = operations.map(operation => {
      const [kind, original] = Object.entries(operation)[0] || [];
      if (!['insertOne', 'updateOne', 'updateMany', 'replaceOne', 'deleteOne', 'deleteMany'].includes(kind)) throw new Error('Unsupported tenant bulk operation');
      const entry = { ...original };
      const explicit = entry.document?.workspaceId || entry.replacement?.workspaceId || entry.filter?.workspaceId;
      const workspaceId = ctx?.bypass ? explicit : ctx.workspaceId;
      if (!workspaceId || explicit && String(explicit) !== String(workspaceId)) throw new Error('Invalid workspace in bulk operation');
      if (entry.document) entry.document = { ...entry.document, workspaceId };
      if (entry.replacement) entry.replacement = { ...entry.replacement, workspaceId };
      if (entry.filter) {
        if (entry.upsert && Object.keys(entry.filter).some(key => key.startsWith('$'))) throw new Error('Bulk upserts require an explicit equality filter');
        entry.filter = { ...entry.filter, workspaceId: toObjectId(workspaceId) };
      }
      if (entry.update) {
        if (Array.isArray(entry.update)) throw new Error('Pipeline bulk updates are not supported');
        entry.update = { ...entry.update };
        for (const [operator, value] of Object.entries(entry.update)) {
          if (!operator.startsWith('$')) throw new Error('Bulk updates must use explicit operators');
          for (const [field, target] of Object.entries(value || {})) {
            if (field === 'workspaceId') {
              if (!['$set', '$setOnInsert'].includes(operator) || String(target) !== String(workspaceId)) throw new Error('workspaceId is immutable');
            } else if (field.startsWith('workspaceId.') || operator === '$rename' && String(target).startsWith('workspaceId')) throw new Error('workspaceId is immutable');
          }
        }
        if (entry.upsert) {
          entry.update.$setOnInsert = { ...entry.update.$setOnInsert };
          if (!entry.update.$set?.workspaceId) entry.update.$setOnInsert.workspaceId = workspaceId;
        }
      }
      return { [kind]: entry };
    });
    return mongoose.Model.bulkWrite.call(this, scoped, options);
  };
  const buildFilter = (ctx) => (
    allowGlobal
      ? { $or: [{ workspaceId: toObjectId(ctx.workspaceId) }, { workspaceId: null, isSystem: true }] }
      : { workspaceId: toObjectId(ctx.workspaceId) }
  );

  function injectQueryFilter() {
    const update = this.getUpdate?.();
    if (update) {
      if (Array.isArray(update)) throw new Error('Pipeline updates on tenant data are not supported');
      for (const [operator, value] of Object.entries(update)) {
        if (operator === '$setOnInsert') continue;
        if (operator === 'workspaceId' || (value && typeof value === 'object' && Object.entries(value).some(([key, target]) => key === 'workspaceId' || key.startsWith('workspaceId.') || (operator === '$rename' && (target === 'workspaceId' || String(target).startsWith('workspaceId.')))))) {
          throw new Error('workspaceId is immutable');
        }
      }
    }
    const ctx = getActiveContext();
    if (!ctx?.bypass && ctx?.workspaceId && update?.$setOnInsert?.workspaceId != null && String(update.$setOnInsert.workspaceId) !== String(ctx.workspaceId)) {
      throw new Error('Cannot insert data into another workspace');
    }
    if (ctx?.bypass) {
      // An upsert that CREATES a new document is a write, not a read — and
      // upserts skip Mongoose document validators by default (even with
      // runValidators, update-validators check schema paths, not this
      // plugin's pre('validate') hook), so pre('validate')'s own guard
      // never fires here. Without this check, `runUnscoped()` +
      // `{upsert: true}` silently persists a tenant-owned document with no
      // tenant — confirmed empirically, not hypothetical.
      if (this.getOptions?.().upsert) {
        const update = this.getUpdate?.() || {};
        const filter = this.getFilter?.() || {};
        const hasExplicitWorkspaceId =
          filter.workspaceId != null ||
          update.workspaceId != null ||
          update.$set?.workspaceId != null ||
          update.$setOnInsert?.workspaceId != null;
        if (!hasExplicitWorkspaceId) {
          throw new Error(
            `Upsert on "${this.model?.modelName || 'unknown model'}" executed under ` +
            'workspaceContext.runUnscoped() with no explicit workspaceId in the filter or update — ' +
            'this would silently create an orphaned document with no tenant. Provide workspaceId ' +
            'explicitly (e.g. via $setOnInsert) or use workspaceContext.run({ workspaceId }, ...) ' +
            'instead of runUnscoped() for this write.'
          );
        }
      }
      return;
    }
    if (!ctx?.workspaceId) {
      throw new Error(
        `Workspace-scoped query on "${this.model?.modelName || 'unknown model'}" executed with no active ` +
        'workspace context. Wrap in workspaceContext.run() or workspaceContext.runUnscoped() explicitly.'
      );
    }
    // .and(), not .where() — a plain merge would silently clobber a
    // pre-existing top-level $or in the caller's own filter (e.g.
    // Role.findResolvable's own membership-resolution $or).
    this.and([buildFilter(ctx)]);
  }

  schema.pre(/^find|^count/, injectQueryFilter);
  schema.pre(['updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'distinct'], injectQueryFilter);

  schema.pre('aggregate', function () {
    const ctx = getActiveContext();
    if (ctx?.bypass) return;
    if (!ctx?.workspaceId) {
      throw new Error(
        `Workspace-scoped aggregate on "${this._model?.modelName || 'unknown model'}" executed with no ` +
        'active workspace context.'
      );
    }
    this.pipeline().unshift({ $match: buildFilter(ctx) });
  });

  // Auto-stamp on single-document create/save — closes the write-side gap
  // so no controller needs to remember to set workspaceId itself. Unlike
  // the read-side hooks above, `ctx.bypass` does NOT exempt a write from
  // needing a real workspaceId — see the plugin-level doc comment.
  schema.pre('validate', function (next) {
    const active = getActiveContext();
    if (!active?.bypass && active?.workspaceId && this.workspaceId != null && String(this.workspaceId) !== String(active.workspaceId)) {
      return next(new Error('Cannot save data in another workspace'));
    }
    if (this.isNew && this.workspaceId == null) {
      const ctx = getActiveContext();
      const isGlobalTemplate = allowGlobal && this.isSystem === true;
      if (ctx?.workspaceId) {
        this.workspaceId = ctx.workspaceId;
      } else if (!isGlobalTemplate) {
        return next(new Error(
          `New "${this.constructor.modelName}" document has no workspaceId and no active workspace context ` +
          '(runUnscoped() does not exempt writes — see workspaceScopePlugin.js).'
        ));
      }
    }
    next();
  });

  // insertMany() does not run document ('validate'/'save') middleware, so it
  // needs its own hook — signature is (next, docs), not (next) with `this`
  // as the document, per Mongoose's insertMany-specific middleware contract.
  // Same bypass rule as pre('validate') above: bypass exempts reads, never writes.
  schema.pre('insertMany', function (next, docs) {
    const ctx = getActiveContext();
    if (!Array.isArray(docs)) return next();

    for (const doc of docs) {
      if (!ctx?.bypass && ctx?.workspaceId && doc.workspaceId != null && String(doc.workspaceId) !== String(ctx.workspaceId)) {
        return next(new Error('Cannot insert data into another workspace'));
      }
      if (doc.workspaceId == null) {
        const isGlobalTemplate = allowGlobal && doc.isSystem === true;
        if (ctx?.workspaceId) {
          doc.workspaceId = ctx.workspaceId;
        } else if (!isGlobalTemplate) {
          return next(new Error(
            `insertMany on "${this.modelName}" executed with a document missing workspaceId and no active ` +
            'workspace context (runUnscoped() does not exempt writes — see workspaceScopePlugin.js).'
          ));
        }
      }
    }
    next();
  });
}

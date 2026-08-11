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
 *  - bulkWrite() bypasses all document/query middleware — nothing in this
 *    codebase calls it on a workspace-owned model today; any future use
 *    must stamp workspaceId into every operation's filter/update by hand.
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
  const buildFilter = (ctx) => (
    allowGlobal
      ? { $or: [{ workspaceId: toObjectId(ctx.workspaceId) }, { workspaceId: null, isSystem: true }] }
      : { workspaceId: toObjectId(ctx.workspaceId) }
  );

  function injectQueryFilter() {
    const ctx = getActiveContext();
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

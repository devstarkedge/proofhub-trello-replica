import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped active-workspace context. Set once per request by
 * `protect` (backend/middleware/authMiddleware.js), read by
 * workspaceScopePlugin.js so every workspace-owned model's queries are
 * scoped automatically without each controller having to remember to add
 * a `workspaceId` filter itself.
 *
 * `runUnscoped()` is the deliberate, grep-able escape hatch for the small
 * number of legitimate cross-tenant operations: creating a brand-new
 * workspace (there is no "active workspace" yet), and the one-time
 * migration/verification scripts. It only exempts reads — see
 * workspaceScopePlugin.js's write-side hooks, which throw regardless of
 * bypass if a new document has no real workspaceId.
 */
const als = new AsyncLocalStorage();

export function run(context, fn) {
  return als.run(context, fn);
}

export function runUnscoped(fn) {
  return als.run({ bypass: true }, fn);
}

export function getActiveContext() {
  return als.getStore();
}

export function getActiveWorkspaceId() {
  return als.getStore()?.workspaceId || null;
}

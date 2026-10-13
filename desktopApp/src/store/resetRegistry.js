/**
 * Central registry for "clear this store's workspace-scoped data" actions.
 *
 * Before this, the only store ever actually cleared on logout was
 * roleStore (one hardcoded call in AuthContext.jsx). Every store that
 * holds workspace-scoped data registers its own reset() here, at module
 * init time, instead of AuthContext/WorkspaceContext needing to know every
 * store by name — so switching workspace (or logging out) can clear all of
 * them with one call, and adding a new store never requires touching this
 * file's callers.
 */
const resetters = new Set();

export function registerResettable(resetFn) {
  if (typeof resetFn !== 'function') return () => {};
  resetters.add(resetFn);
  return () => resetters.delete(resetFn);
}

export function resetAllOnWorkspaceSwitch() {
  resetters.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('resetRegistry: a store reset() threw', err);
    }
  });
}

export default { registerResettable, resetAllOnWorkspaceSwitch };

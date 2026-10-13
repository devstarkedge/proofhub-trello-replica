/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║               GLOBAL DROPDOWN MANAGER — SINGLETON              ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Ensures only ONE SearchableSelect dropdown is open at any     ║
 * ║  time across the entire application. When a new dropdown       ║
 * ║  opens, the previously active one is forcefully closed first.  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

let activeInstance = null;

/**
 * Register a dropdown as the currently active (open) one.
 * If another dropdown is already open, its close callback fires first.
 *
 * @param {string}   id      — unique instance identifier
 * @param {Function} closeFn — synchronous close callback (should use flushSync)
 */
export function registerOpenDropdown(id, closeFn) {
  if (activeInstance && activeInstance.id !== id) {
    try {
      activeInstance.close();
    } catch {
      // Stale reference to unmounted component — harmless
    }
  }
  activeInstance = { id, close: closeFn };
}

/**
 * Unregister a dropdown (called on close or unmount).
 *
 * @param {string} id — the same identifier used when registering
 */
export function unregisterDropdown(id) {
  if (activeInstance?.id === id) {
    activeInstance = null;
  }
}

/**
 * Force-close whatever dropdown is currently open.
 */
export function closeActiveDropdown() {
  if (activeInstance) {
    try {
      activeInstance.close();
    } catch {
      // Component may have unmounted
    }
    activeInstance = null;
  }
}

/**
 * Focus management utilities for keyboard-first navigation.
 */

const TABBABLE_SELECTOR = [
  'input:not([disabled]):not([tabindex="-1"]):not([type="hidden"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
].join(', ');

/**
 * Get all tabbable (keyboard-focusable) elements in DOM order.
 *
 * @param {HTMLElement} [root=document] — scope for the query
 * @returns {HTMLElement[]}
 */
export function getTabbableElements(root = document) {
  return [...root.querySelectorAll(TABBABLE_SELECTOR)].filter((el) => {
    // Must be visible (has layout)
    if (el.offsetParent === null && el.tagName !== 'BODY') return false;
    // Must not be inside an aria-hidden region
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  });
}

/**
 * Move focus to the next (or previous) tabbable element relative to `fromElement`.
 *
 * @param {HTMLElement} fromElement — the reference element
 * @param {boolean}     [reverse=false] — true for Shift+Tab direction
 * @returns {boolean} whether focus was successfully moved
 */
export function focusNextTabbable(fromElement, reverse = false) {
  if (!fromElement) return false;

  const all = getTabbableElements();
  const idx = all.indexOf(fromElement);
  if (idx === -1) {
    // fromElement might have been removed — try nearest ancestor still in list
    // Fall back to the first/last element
    const fallback = reverse ? all[all.length - 1] : all[0];
    if (fallback) { fallback.focus(); return true; }
    return false;
  }

  const nextIdx = reverse ? idx - 1 : idx + 1;
  if (nextIdx >= 0 && nextIdx < all.length) {
    all[nextIdx].focus();
    return true;
  }
  return false;
}

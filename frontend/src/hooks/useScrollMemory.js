import { useCallback } from 'react';

const DEFAULT_SCROLL_KEY = 'flowtask:home:scrollTop:v1';
const DEFAULT_UI_KEY = 'flowtask:home:uiState:v1';

export function saveScrollPosition(key = DEFAULT_SCROLL_KEY, value) {
  try {
    sessionStorage.setItem(key, String(value ?? 0));
  } catch (e) {
    // ignore storage errors
  }
}

export function getScrollPosition(key = DEFAULT_SCROLL_KEY) {
  try {
    const v = sessionStorage.getItem(key);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    return null;
  }
}

export function clearScrollPosition(key = DEFAULT_SCROLL_KEY) {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {}
}

export function saveUIState(state, key = DEFAULT_UI_KEY) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state || {}));
  } catch (e) {}
}

export function getUIState(key = DEFAULT_UI_KEY) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export default function useScrollMemory(key = DEFAULT_SCROLL_KEY) {
  const save = useCallback((container) => {
    if (!container) return;
    try {
      const pos = container.scrollTop ?? 0;
      saveScrollPosition(key, pos);
    } catch (e) {}
  }, [key]);

  const restore = useCallback((container, { instant = true, clamp = true } = {}) => {
    if (!container) return;
    try {
      const saved = getScrollPosition(key);
      if (saved == null) return;
      const max = Math.max(0, container.scrollHeight - container.clientHeight);
      let target = saved;
      if (clamp && target > max) target = max;
      if (instant) {
        container.scrollTop = target;
      } else {
        container.scrollTo({ top: target, behavior: 'smooth' });
      }
    } catch (e) {}
  }, [key]);

  return {
    save,
    restore,
    get: getScrollPosition,
    clear: clearScrollPosition,
    saveUIState,
    getUIState,
  };
}

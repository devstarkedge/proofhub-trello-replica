import { useState, useSyncExternalStore } from 'react';

// Match Tailwind's existing md/lg breakpoints. Only notify React at a boundary.
const subscribeViewport = (notify) => {
  const queries = ['(min-width: 768px)', '(min-width: 1024px)'].map((query) => window.matchMedia(query));
  queries.forEach((query) => query.addEventListener('change', notify));
  return () => queries.forEach((query) => query.removeEventListener('change', notify));
};
const getViewport = () => window.matchMedia('(min-width: 1024px)').matches
  ? 'desktop' : window.matchMedia('(min-width: 768px)').matches ? 'tablet' : 'mobile';

const readPreference = (key) => {
  try {
    const value = localStorage.getItem(key);
    return value === 'collapsed' ? true : value === 'expanded' ? false : null;
  } catch {
    return null;
  }
};

export default function useSidebarLayout(userId) {
  const viewport = useSyncExternalStore(subscribeViewport, getViewport, () => 'desktop');
  // A display preference belongs to the account, independent of workspace roles.
  const key = `flowtask:sidebar:${userId || 'guest'}`;
  const [preference, setPreference] = useState(() => ({ key, collapsed: readPreference(key) }));
  if (preference.key !== key) {
    setPreference({ key, collapsed: readPreference(key) });
  }
  const saved = preference.key === key ? preference.collapsed : readPreference(key);
  const collapsed = saved ?? viewport === 'tablet';

  const toggleCollapsed = () => {
    const next = !collapsed;
    setPreference({ key, collapsed: next });
    try {
      localStorage.setItem(key, next ? 'collapsed' : 'expanded');
    } catch {
      // The control still works when browser storage is unavailable.
    }
  };

  return { isMobile: viewport === 'mobile', collapsed, toggleCollapsed };
}

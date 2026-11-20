import { useEffect, useRef, useState } from 'react';

// The layout owns the Finance socket room. Views only subscribe to invalidation.
export default function useFinanceRefresh(refresh, enabled = true) {
  const latest = useRef(refresh), [revision, setRevision] = useState(0);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let timer;
    const changed = event => {
      const { type = '', payload = {} } = event.detail || {};
      if (payload.workspaceId && String(payload.workspaceId) !== localStorage.getItem('workspaceId')) return;
      if (event.type === 'flowtask:realtime' && !/^(finance:|board|card|task|milestone|time-logged|estimation|department|authz|access|workspace-updated|workspace-membership|user-verified|user-role-changed|user:access)/.test(type)) return;
      clearTimeout(timer);
      timer = setTimeout(() => { setRevision(value => value + 1); latest.current(type); }, 250);
    };
    for (const event of ['flowtask:realtime', 'socket-connected', 'online']) window.addEventListener(event, changed);
    return () => { clearTimeout(timer); for (const event of ['flowtask:realtime', 'socket-connected', 'online']) window.removeEventListener(event, changed); };
  }, [enabled]);
  return revision;
}

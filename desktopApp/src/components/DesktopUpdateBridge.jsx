import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { hasPendingSessionActions } from '../services/sessionActions';
import { hasPendingWorkspacePreferences } from '../services/workspacePreferences';
import { applyUpdateStatus, useDesktopUpdates, updateStatusText, checkDesktopUpdates, restartDesktopUpdate, postponeDesktopUpdate } from '../services/desktopUpdates';

export default function DesktopUpdateBridge() {
  const state = useDesktopUpdates();
  useEffect(() => {
    const updates = window.flowtaskDesktop?.updates;
    if (!updates) return;
    let live = true, wasInert = false, frozen = false;
    const unfreeze = () => { if (frozen && !wasInert) document.getElementById('root')?.removeAttribute('inert'); frozen = false; };
    const stopStatus = updates.onStatus(value => { if (live) { applyUpdateStatus(value); if (value.phase !== 'installing') unfreeze(); } });
    updates.getStatus().then(value => { if (live) applyUpdateStatus(value); }).catch(() => {});
    const stopPrepare = updates.onPrepare(requestId => {
      let safe = false, authenticated = false;
      try {
        authenticated = Boolean(localStorage.getItem('token'));
        const sales = JSON.parse(localStorage.getItem('sales-storage') || 'null');
        const pendingPreferences = Object.keys(localStorage).some(key => {
          if (!key.startsWith('flowtask:preferences:v1:')) return false;
          try { return Object.keys(JSON.parse(localStorage.getItem(key))?.pending || {}).length > 0; } catch { return true; }
        });
        const unload = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unload);
        safe = !hasPendingSessionActions() && !hasPendingWorkspacePreferences() && !pendingPreferences && !sales?.state?.pendingDrafts?.length && !unload.defaultPrevented;
        if (safe && !frozen) { const root = document.getElementById('root'); wasInert = root?.hasAttribute('inert') || false; root?.setAttribute('inert', ''); frozen = true; }
      } catch { safe = false; }
      updates.prepared({ requestId, safe, authenticated });
    });
    const stopRelease = updates.onRelease(unfreeze);
    return () => { live = false; stopStatus(); stopPrepare(); stopRelease(); unfreeze(); };
  }, []);
  if (!state.enabled || state.dismissed || !['available', 'downloading', 'downloaded', 'installing', 'error', 'checking', 'up-to-date'].includes(state.phase) || ['checking', 'up-to-date', 'error'].includes(state.phase) && !state.manual) return null;
  return createPortal(<aside aria-label="FlowTask application update" role="status" className="fixed bottom-5 right-5 z-[10000] w-[min(360px,calc(100vw-2rem))] rounded-2xl border p-4 shadow-xl" style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}>
    <div className="flex items-center gap-2 text-sm font-semibold"><Download size={17} />{updateStatusText(state)}</div>
    <p className="mt-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>Installed {state.currentVersion}{state.version ? ` · New version ${state.version}` : ''}</p>
    {state.phase === 'downloading' && <progress className="mt-3 h-2 w-full accent-blue-600" max="100" value={state.progress} aria-label="Update download progress" />}
    {state.message && <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{state.message}</p>}
    {state.phase === 'downloaded' && <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Restart when your attendance, work and pending uploads have finished.</p>}
    <div className="mt-3 flex justify-end gap-2">
      <Button size="sm" variant="outline" disabled={state.phase === 'installing'} onClick={postponeDesktopUpdate}>{state.phase === 'downloaded' ? 'Later' : 'Dismiss'}</Button>
      {state.phase === 'downloaded' && <Button size="sm" onClick={restartDesktopUpdate}><RefreshCw size={14} />Restart to Update</Button>}
      {state.phase === 'error' && <Button size="sm" onClick={checkDesktopUpdates}>Retry</Button>}
    </div>
  </aside>, document.body);
}

export function DesktopUpdateMenuItem() {
  const state = useDesktopUpdates();
  if (!state.enabled) return null;
  return <button type="button" onClick={state.phase === 'downloaded' ? restartDesktopUpdate : checkDesktopUpdates} disabled={['checking', 'downloading', 'installing'].includes(state.phase)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm disabled:opacity-60" style={{ color: 'var(--color-text-primary)' }}><Download size={18} /><span>{state.phase === 'downloaded' ? 'Restart to Update' : updateStatusText(state)}<span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>FlowTask {state.currentVersion}{state.version ? ` → ${state.version}` : ''}</span></span></button>;
}

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleAlert, Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { hasPendingSessionActions } from '../services/sessionActions';
import { hasPendingWorkspacePreferences } from '../services/workspacePreferences';
import { applyUpdateStatus, useDesktopUpdates, updateStatusText, restartSteps, canRequestRestart, checkDesktopUpdates, restartDesktopUpdate, postponeDesktopUpdate, cancelDesktopUpdate } from '../services/desktopUpdates';

function restartDescription(state) {
  switch (state.restartStage) {
    case 'requested': return 'FlowTask received your restart request.';
    case 'waiting': return state.message || (state.restartMode === 'idle'
      ? 'Waiting for attendance, work and pending uploads to finish.'
      : 'Checking your work session and pending changes. You can keep working while this runs.');
    case 'preparing': return 'Checking for pending changes and saving activity before closing FlowTask.';
    case 'restarting': return state.restartOnExit
      ? 'The update will install as FlowTask closes.'
      : 'FlowTask is closing so the installer can run.';
    default: return state.message;
  }
}

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
  const showStatus = ['available', 'downloading', 'downloaded', 'installing'].includes(state.phase)
    || state.manual && ['error', 'checking', 'up-to-date'].includes(state.phase);
  if (!state.enabled || (!showStatus && !state.actionError) || (state.dismissed && !state.actionError)) return null;

  const currentStep = restartSteps.findIndex(({ id }) => id === state.restartStage);
  const restarting = currentStep >= 0;
  const downloaded = state.phase === 'downloaded';
  const restartFailed = state.restartStage === 'failed';
  const showCancel = downloaded && state.restartPending;
  const showLater = downloaded && !(state.restartPending && state.restartMode === 'idle');
  const showRestart = downloaded && !(state.restartPending && state.restartMode === 'now');
  const showDismiss = !downloaded && state.phase !== 'installing';
  const statusText = updateStatusText(state);
  const description = restartDescription(state);
  const StatusIcon = restartFailed || state.phase === 'error' ? CircleAlert : Download;

  return createPortal(
    <aside aria-label="FlowTask application update" className="fixed bottom-5 right-5 z-[10000] max-h-[calc(100dvh-2.5rem)] w-[min(360px,calc(100vw-2.5rem))] overflow-y-auto rounded-2xl border p-4 shadow-xl"
      style={{ backgroundColor: 'var(--color-card-bg)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' }}>
      <div role="status" className="sr-only">{statusText}. {description} {state.actionError}</div>
      <h2 className="flex items-center gap-2 text-sm font-semibold"><StatusIcon size={17} aria-hidden="true" />{restarting ? 'FlowTask update' : statusText}</h2>
      <p className="mt-2 text-xs text-[var(--color-text-secondary)]">Installed {state.currentVersion}{state.version ? ` · New version ${state.version}` : ''}</p>
      {state.phase === 'downloading' && <progress className="mt-3 h-2 w-full accent-blue-600" max="100" value={state.progress} aria-label="Update download progress" />}

      {restarting ? (
        <>
          <ol aria-label="Restart progress" className="mt-3 space-y-2 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3 text-xs">
            {restartSteps.map(({ id, label }, index) => {
              const current = index === currentStep;
              const passed = index < currentStep;
              return (
                <li key={id} aria-current={current ? 'step' : undefined} className="flex items-start gap-2">
                  <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center text-[var(--color-primary)]">
                    {current ? <LoaderCircle size={15} className="motion-safe:animate-spin" />
                      : passed ? <Check size={14} />
                        : <span className="h-2 w-2 rounded-full border border-[var(--color-text-muted)]" />}
                  </span>
                  <div>
                    <p className={current ? 'font-semibold' : 'text-[var(--color-text-secondary)]'}>
                      {id === 'restarting' && state.restartOnExit ? 'Closing to install' : label}
                    </p>
                    {current && <p className="mt-1 leading-relaxed text-[var(--color-text-secondary)]">{description}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {state.restartOnExit
              ? 'Your saved work will be available the next time you open FlowTask.'
              : 'FlowTask will restart automatically when it’s safe. Your saved activity and work session will carry over.'}
          </p>
        </>
      ) : (
        <>
          {description && <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{description}</p>}
          {downloaded && !restartFailed && <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">Restart now to save activity and continue the same session after updating. Later schedules the update after attendance, work and pending uploads finish.</p>}
        </>
      )}
      {state.actionError && <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">{state.actionError}</p>}

      {state.phase !== 'installing' && <div className="mt-3 flex flex-wrap justify-end gap-2">
        {showCancel && <Button size="sm" variant="outline" onClick={cancelDesktopUpdate}>Cancel</Button>}
        {showLater && <Button size="sm" variant="outline" disabled={state.restartSubmitting} onClick={postponeDesktopUpdate}>Later</Button>}
        {showDismiss && <Button size="sm" variant="outline" onClick={postponeDesktopUpdate}>Dismiss</Button>}
        {showRestart && <Button size="sm" className="gap-1.5" disabled={!canRequestRestart(state)} onClick={restartDesktopUpdate}>
          <RefreshCw size={14} aria-hidden="true" />
          {state.restartSubmitting ? 'Requesting restart…' : restartFailed ? 'Retry restart' : 'Restart to Update'}
        </Button>}
        {state.phase === 'error' && <Button size="sm" onClick={checkDesktopUpdates}>Retry</Button>}
      </div>}
    </aside>, document.body
  );
}

export function DesktopUpdateMenuItem() {
  const state = useDesktopUpdates();
  if (!state.enabled) return null;
  const downloaded = state.phase === 'downloaded';
  const canRestart = canRequestRestart(state);
  const disabled = downloaded ? !canRestart : ['checking', 'downloading', 'installing'].includes(state.phase);
  return <button type="button" onClick={downloaded ? restartDesktopUpdate : checkDesktopUpdates} disabled={disabled} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm disabled:opacity-60" style={{ color: 'var(--color-text-primary)' }}>
    <Download size={18} aria-hidden="true" />
    <span>{canRestart ? state.restartStage === 'failed' ? 'Retry restart' : 'Restart to Update' : updateStatusText(state)}
      <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>FlowTask {state.currentVersion}{state.version ? ` → ${state.version}` : ''}</span>
    </span>
  </button>;
}

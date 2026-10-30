const attentionStates = new Set([
  'error', 'capture-failed', 'storage-unavailable', 'permission-required',
  'permission-denied', 'notice-required', 'update-required'
]);
const failedSyncStates = new Set(['capture-failed', 'storage-unavailable', 'retry-pending']);
const idleStates = new Set(['paused', 'ready', 'disabled', 'resuming']);

export function monitoringAttention({ native, device, sessionStatus, enabled = true, monitoringEnabled = true, expired = false, error }) {
  const running = enabled && monitoringEnabled && sessionStatus === 'RUNNING';
  const status = native || device;
  // A scoped Electron snapshot is newer than the persisted heartbeat. Do not
  // resurrect a resolved upload error from that older server snapshot.
  const pending = Math.max(0, Number(native?.pending) || 0);
  const idleReason = (!running || idleStates.has(native?.state)) && !native?.errorCode && [
    'Work is not running', 'Monitoring unavailable', 'Time Tracking disabled by workspace Admin'
  ].includes(native?.error);
  const monitoringError = native
    ? (idleReason ? '' : native.error || '')
    : device?.lastUploadError || '';
  const needsAttention = Boolean(
    error || expired || native?.protectedCopies > 0 || native?.uploadError || native?.errorCode ||
    native?.noticeRequired || native?.updateRequired || monitoringError ||
    attentionStates.has(status?.state) || failedSyncStates.has(native?.syncStatus) || native?.permission === 'denied' ||
    (running && ['unavailable', 'offline'].includes(status?.state))
  );
  return { needsAttention, monitoringError, pending };
}

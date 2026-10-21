const attentionStates = new Set([
  'error', 'capture-failed', 'storage-unavailable', 'permission-required',
  'permission-denied', 'notice-required', 'update-required'
]);

export function monitoringAttention({ native, device, sessionStatus, enabled = true, monitoringEnabled = true, expired = false, error }) {
  const running = enabled && monitoringEnabled && sessionStatus === 'RUNNING';
  const status = native || device;
  // A scoped Electron snapshot is newer than the persisted heartbeat. Do not
  // resurrect a resolved upload error from that older server snapshot.
  const pending = Math.max(0, Number(native?.pending) || 0);
  const idleReason = !running && !native?.errorCode && [
    'Work is not running', 'Monitoring unavailable', 'Time Tracking disabled by workspace Admin'
  ].includes(native?.error);
  const monitoringError = native
    ? (idleReason ? '' : native.error || '')
    : device?.lastUploadError || '';
  const needsAttention = Boolean(
    error || expired || pending || native?.protectedCopies > 0 || native?.uploadError ||
    native?.noticeRequired || native?.updateRequired || monitoringError ||
    attentionStates.has(status?.state) || native?.permission === 'denied' ||
    (running && ['unavailable', 'offline'].includes(status?.state))
  );
  return { needsAttention, monitoringError, pending };
}

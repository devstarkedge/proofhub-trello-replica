// The notice describes workspace-controlled monitoring. Administrative policy
// revisions do not require employees to configure or consent again each day.
export const MONITORING_NOTICE_VERSION = 1;
export function hasMonitoringNotice(device) {
  return Boolean(device?.consentAt && (device.noticeVersion || (device.consentRevision > 0 ? 1 : 0)) === MONITORING_NOTICE_VERSION);
}
export function workspaceCapturePreferences(policy) {
  return {
    enabled: Boolean(policy.enabled && policy.monitoringEnabled),
    intervalSeconds: policy.intervalSeconds,
    monitors: policy.monitors || 'primary', blur: Boolean(policy.blur),
    excludedDisplayIds: policy.excludedDisplayIds || [],
    excludeWindowTitles: policy.excludeWindowTitles || []
  };
}

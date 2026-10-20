// The backend resolves the exact verified filename identity. Keep it verbatim;
// record IDs remain stable fallbacks for old APIs, never monitor/device IDs.
export function screenshotIdentity(record) {
  if (typeof record === 'string') return record;
  return record?.screenshotIdentity || record?._id || '';
}

export function screenshotDisplayName(record) {
  return screenshotIdentity(record) || 'Screenshot ID unavailable';
}

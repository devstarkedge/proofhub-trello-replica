export function formatPersonalPause(seconds) {
  const minutes = Math.floor(Math.max(0, seconds || 0) / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

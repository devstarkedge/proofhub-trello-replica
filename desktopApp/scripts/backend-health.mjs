export async function assertBackendAvailable(origin, timeoutMs = 1500) {
  let target;
  try {
    target = new URL(origin);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error();
  } catch { throw new Error('Backend unavailable: configure a valid VITE_BACKEND_URL'); }
  try {
    const response = await fetch(new URL('/api/health', target.origin), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`); error.code = 'BACKEND_UNHEALTHY'; throw error;
    }
    const data = await response.json();
    if (!['ok', 'healthy', 'ready'].includes(data.status) && data.success !== true) throw new Error('Invalid health response');
  } catch (cause) {
    const error = new Error(`Backend ${target.origin} unavailable (${cause.message}). Start it with npm run dev in the backend folder, or use the desktop --with-backend option.`);
    error.code = cause.code || 'BACKEND_UNAVAILABLE'; throw error;
  }
}

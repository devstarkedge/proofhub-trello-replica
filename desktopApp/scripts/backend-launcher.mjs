import { spawn } from 'node:child_process';
import path from 'node:path';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { assertBackendAvailable } from './backend-health.mjs';

// A health timeout or invalid HTTP response does not mean the port is free.
// Check both loopback families, since the backend binds a wildcard address.
async function isPortInUse(port) {
  const listeners = await Promise.all(['127.0.0.1', '::1'].map(host => new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const finish = occupied => { socket.destroy(); resolve(occupied); };
    socket.once('connect', () => finish(true));
    socket.once('error', error => {
      socket.destroy();
      if (['ECONNREFUSED', 'EAFNOSUPPORT', 'EADDRNOTAVAIL', 'ENETUNREACH'].includes(error.code)) resolve(false);
      else reject(error);
    });
    // An inconclusive check must not launch a competing backend.
    socket.setTimeout(1000, () => finish(true));
  })));
  return listeners.some(Boolean);
}

/** Never start a second backend over an already healthy or warming service. */
export async function ensureBackend(origin, { root, start = spawn, probe = assertBackendAvailable, portInUse = isPortInUse, timeoutMs = 60000, sleep = delay, signal } = {}) {
  signal?.throwIfAborted();
  let initial;
  try { await probe(origin); return null; } catch (error) { initial = error; }
  signal?.throwIfAborted();
  const url = new URL(origin);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) throw initial;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const occupied = initial.code === 'BACKEND_UNHEALTHY' || await portInUse(port);
  signal?.throwIfAborted();
  let child = null, launchError;
  if (!occupied) {
    child = start(process.execPath, ['server.js'], { cwd: path.resolve(root, '../backend'), env: { ...process.env, PORT: String(port) }, stdio: 'inherit', windowsHide: true });
    child.once('error', error => { launchError = error; });
  }
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      if (launchError || child && child.exitCode != null) throw new Error(`Local backend exited before it became ready${launchError ? `: ${launchError.message}` : ''}`);
      try { await probe(origin); signal?.throwIfAborted(); return child; } catch { /* Startup may still be initializing. */ }
      signal?.throwIfAborted();
      await sleep(500, undefined, { signal });
    }
    const hint = occupied
      ? `Port ${port} is already in use; no duplicate backend was started. Check the existing service or configure a different VITE_BACKEND_URL.`
      : 'Check the backend startup log.';
    throw new Error(`Backend ${url.origin} did not become ready before the startup deadline. ${hint}`);
  } catch (error) { child?.kill(); throw error; }
}

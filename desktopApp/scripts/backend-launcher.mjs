import { spawn } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { assertBackendAvailable } from './backend-health.mjs';

/** Never start a second backend over an already healthy or warming service. */
export async function ensureBackend(origin, { root, start = spawn, probe = assertBackendAvailable, timeoutMs = 60000, sleep = delay, signal } = {}) {
  signal?.throwIfAborted();
  let initial;
  try { await probe(origin); return null; } catch (error) { initial = error; }
  signal?.throwIfAborted();
  const url = new URL(origin);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)) throw initial;
  let child = null, launchError;
  if (initial.code !== 'BACKEND_UNHEALTHY') {
    child = start(process.execPath, ['server.js'], { cwd: path.resolve(root, '../backend'), env: { ...process.env, PORT: url.port || '5000' }, stdio: 'inherit', windowsHide: true });
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
    throw new Error(`Backend ${url.origin} did not become ready before the startup deadline. Check the backend startup log.`);
  } catch (error) { child?.kill(); throw error; }
}

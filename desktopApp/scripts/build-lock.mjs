import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// All targets and versions share dist, build/app, and release/win-unpacked.
// Hold this lock from before Vite clears dist until packaging is verified.
export async function acquireBuildLock(root) {
  const filename = path.join(root, 'build', '.desktop-build.lock');
  await fs.mkdir(path.dirname(filename), { recursive: true });
  let handle;
  try {
    handle = await fs.open(filename, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await fs.readFile(filename, 'utf8').then(JSON.parse).catch(() => null);
    const pid = Number.isSafeInteger(owner?.pid) && owner.pid > 0 ? owner.pid : null;
    let active = false;
    if (pid) {
      try { process.kill(pid, 0); active = true; }
      catch (error) { active = error.code !== 'ESRCH'; }
    }
    // Do not automatically reclaim an interrupted parent's lock: its builder
    // or archive child may still be writing the shared output directories.
    throw new Error(active
      ? `Another desktop build is already running (PID ${pid}). Wait for it to finish before rebuilding.`
      : `An interrupted desktop build left ${filename}. Confirm no desktop packaging process is running, then remove this lock file and retry.`);
  }
  const token = randomUUID();
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }));
  } catch (error) {
    await handle.close();
    await fs.unlink(filename);
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await handle.close();
    const owner = await fs.readFile(filename, 'utf8').then(JSON.parse).catch(() => null);
    if (owner?.token === token) await fs.unlink(filename);
  };
}

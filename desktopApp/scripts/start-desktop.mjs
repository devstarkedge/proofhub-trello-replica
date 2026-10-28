import { spawn } from 'node:child_process';
import { createServer, loadEnv } from 'vite';
import { ensureElectron, electronEnvironment, root } from './electron-runtime.mjs';
import { assertBackendAvailable } from './backend-health.mjs';
import { ensureBackend } from './backend-launcher.mjs';
import desktopConfig from '../electron/config.cjs';

let server;
let child;
let backendChild;
const startup = new AbortController();
async function stop() {
  startup.abort();
  child?.kill();
  backendChild?.kill();
  await server?.close();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const preview = process.argv.includes('--preview');
  const settings = loadEnv('development', root, 'VITE_');
  const backendOrigin = preview ? desktopConfig.readBackendURL(root) : desktopConfig.selectBackendURL({ ...settings, ...process.env }, false);
  if (process.argv.includes('--with-backend')) backendChild = await ensureBackend(backendOrigin, { root, signal: startup.signal });
  else await assertBackendAvailable(backendOrigin);
  const executable = await ensureElectron();
  const smoke = process.argv.includes('--smoke-test');
  if (!preview) {
    server = await createServer({ root, server: { port: Number(process.env.FLOWTASK_DEV_PORT || 5175) } });
    await server.listen();
    server.printUrls();
  }
  const env = electronEnvironment();
  delete env.FLOWTASK_DEV_URL;
  if (server) env.FLOWTASK_DEV_URL = `http://127.0.0.1:${server.config.server.port}`;
  child = spawn(executable, ['.', ...(smoke ? ['--smoke-test'] : []),...(process.argv.includes('--isolated-test-profile')?['--isolated-test-profile']:[])], { cwd: root, env, stdio: 'inherit', windowsHide: false });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  await stop();
  process.exitCode = code;
} catch (error) {
  await stop();
  console.error(`FlowTask desktop could not start: ${error.message}`);
  process.exitCode = 1;
}

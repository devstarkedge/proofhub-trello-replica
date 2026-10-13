import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { ensureElectron, electronEnvironment, root } from './electron-runtime.mjs';

let server;
let child;
async function stop() {
  child?.kill();
  await server?.close();
}
try {
  const executable = await ensureElectron();
  const preview = process.argv.includes('--preview');
  const smoke = process.argv.includes('--smoke-test');
  if (!preview) {
    server = await createServer({ root, server: { port: Number(process.env.FLOWTASK_DEV_PORT || 5175) } });
    await server.listen();
    server.printUrls();
  }
  const env = electronEnvironment();
  delete env.FLOWTASK_DEV_URL;
  if (server) env.FLOWTASK_DEV_URL = `http://127.0.0.1:${server.config.server.port}`;
  child = spawn(executable, ['.', ...(smoke ? ['--smoke-test'] : [])], { cwd: root, env, stdio: 'inherit', windowsHide: false });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  await server?.close();
  process.exitCode = code;
} catch (error) {
  await stop();
  console.error(`FlowTask desktop could not start: ${error.message}`);
  process.exitCode = 1;
}

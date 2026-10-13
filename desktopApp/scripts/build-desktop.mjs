import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureElectron, root, run } from './electron-runtime.mjs';

const require = createRequire(import.meta.url);
const target = process.argv[2];
try {
  if (!['win', 'mac', 'dir'].includes(target)) throw new Error('Build target must be win, mac, or dir.');
  if (target === 'mac' && process.platform !== 'darwin') {
    throw new Error('Run npm run build:mac on macOS to create the macOS DMG. This computer is running ' + process.platform + '.');
  }
  // Vite enforces VITE_BACKEND_PRODUCTION and writes it into the bundled config.
  await run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'production']);
  const nativeRuntime = target === 'dir' || target === 'mac' || (process.platform === 'win32' && process.arch === 'x64');
  if (nativeRuntime) await ensureElectron();
  await run(process.execPath, [path.join(root, 'scripts/prepare-package.mjs')]);
  const args = target === 'win' ? ['--win', 'nsis'] : target === 'mac' ? ['--mac', 'dmg'] : ['--dir'];
  // Never reuse a Windows runtime for a macOS package (or another architecture).
  if (nativeRuntime) args.push('--config.electronDist=' + path.join(root, 'node_modules/electron/dist'));
  await run(process.execPath, [require.resolve('electron-builder/cli.js'), ...args, '--publish', 'never']);
} catch (error) {
  console.error('FlowTask desktop build failed:', error.message);
  process.exitCode = 1;
}

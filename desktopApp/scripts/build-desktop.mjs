import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { ensureElectron, root, run } from './electron-runtime.mjs';
import { acquireBuildLock } from './build-lock.mjs';
import { verifyWindowsPackage } from './verify-windows-package.mjs';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
let releaseBuildLock;
try {
  const { positionals, values } = parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { publish: { type: 'string', default: 'never' } } });
  const target = positionals[0];
  if (positionals.length !== 1) throw new Error('Specify exactly one build target: win, mac, or dir.');
  if (!['win', 'mac', 'dir'].includes(target)) throw new Error('Build target must be win, mac, or dir.');
  if (values.publish !== 'never') throw new Error('Builds are local-only. Use npm run release:win for the verified single-release publishing workflow.');
  if (target === 'mac' && process.platform !== 'darwin') {
    throw new Error('Run npm run build:mac on macOS to create the macOS DMG. This computer is running ' + process.platform + '.');
  }
  releaseBuildLock = await acquireBuildLock(root);
  console.log('Building desktop renderer...');
  // Vite enforces VITE_BACKEND_PRODUCTION and writes it into the bundled config.
  await run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--mode', 'production']);
  const nativeRuntime = target === 'dir' || target === 'mac' || (process.platform === 'win32' && process.arch === 'x64');
  if (nativeRuntime) await ensureElectron();
  console.log('Preparing desktop package...');
  await run(process.execPath, [path.join(root, 'scripts/prepare-package.mjs')]);
  const args = target === 'win' ? ['--win', 'nsis'] : target === 'mac' ? ['--mac', 'dmg'] : ['--dir'];
  // Never reuse a Windows runtime for a macOS package (or another architecture).
  if (nativeRuntime) args.push('--config.electronDist=' + path.join(root, 'node_modules/electron/dist'));
  console.log('Packaging desktop application...');
  await run(process.execPath, [require.resolve('electron-builder/cli.js'), ...args, '--publish', values.publish]);
  if (target === 'win') {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'build/app/package.json'), 'utf8'));
    await verifyWindowsPackage(root, manifest.version);
  }
  console.log('FlowTask desktop build completed successfully.');
} catch (error) {
  console.error('FlowTask desktop build failed:', error.message);
  process.exitCode = 1;
} finally {
  if (releaseBuildLock) await releaseBuildLock();
}

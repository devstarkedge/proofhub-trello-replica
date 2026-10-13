import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const root = fileURLToPath(new URL('../', import.meta.url));
const electronDir = path.dirname(require.resolve('electron/package.json'));
const electronPackage = require('electron/package.json');
const relativeExecutable = process.platform === 'win32' ? 'electron.exe' :
  process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with ${signal || code}`)));
  });
}

export function getElectronExecutable() {
  const filename = path.join(electronDir, 'dist', relativeExecutable);
  const versionFile = path.join(electronDir, 'dist/version');
  return fs.existsSync(filename) && fs.existsSync(versionFile) &&
    fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '') === electronPackage.version ? filename : null;
}

export async function ensureElectron() {
  let executable = getElectronExecutable();
  if (executable) return executable;
  console.log(`Installing the missing Electron ${electronPackage.version} runtime...`);
  try {
    await run(process.execPath, [path.join(electronDir, 'install.js')]);
  } catch (error) {
    if (process.platform !== 'win32') throw error;
    console.log('Node download failed. Retrying with the Windows downloader (SHA-256 verification remains enabled).');
    const { downloadArtifact } = await import('@electron/get');
    const zip = await downloadArtifact({
      version: electronPackage.version, artifactName: 'electron', platform: process.platform, arch: process.arch,
      checksums: require(path.join(electronDir, 'checksums.json')),
      downloader: { download: (url, destination) => run('curl.exe', [
        '--fail', '--location', '--retry', '3', '--retry-all-errors', '--connect-timeout', '20',
        '--max-time', '600', '--output', destination, url,
      ]) },
    });
    const { extract } = require('@electron-internal/extract-zip');
    await extract(zip, { dir: path.join(electronDir, 'dist') });
    await fs.promises.writeFile(path.join(electronDir, 'path.txt'), relativeExecutable);
  }
  executable = getElectronExecutable();
  if (!executable) throw new Error('Electron installation is incomplete. Run npm run electron:repair.');
  return executable;
}

export function electronEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  // Desktop terminal hosts sometimes set this for their own Node helpers.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

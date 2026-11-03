import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const exec = promisify(execFile);

export function checkPackageEntries(listing, expectedFiles) {
  const entries = new Map();
  for (const record of listing.split(/\r?\n\s*\r?\n/)) {
    const filename = record.match(/^Path = (.+)$/m)?.[1]?.trim().replaceAll('\\', '/');
    const size = record.match(/^Size = (\d+)\r?$/m)?.[1];
    if (filename && size !== undefined) entries.set(filename, Number(size));
  }
  const critical = [
    'FlowTask.exe', 'resources/app.asar', 'resources.pak', 'icudtl.dat',
    'resources/node_modules/uiohook-napi/dist/index.js',
    'resources/node_modules/uiohook-napi/prebuilds/win32-x64/uiohook-napi.node',
    'resources/node_modules/node-gyp-build/index.js',
    'resources/node_modules/sharp/dist/index.cjs',
    'resources/node_modules/socket.io-client/build/cjs/index.js',
    'resources/node_modules/ws/index.js',
  ];
  const missing = critical.filter(filename => !(entries.get(filename) > 0));
  if (![...entries].some(([filename, size]) => /^resources\/node_modules\/@img\/sharp-win32-x64\/lib\/sharp-win32-x64(?:-[\d.]+)?\.node$/.test(filename) && size > 0)) {
    missing.push('sharp Windows native module');
  }
  const mismatched = [...expectedFiles].filter(([filename, size]) => entries.get(filename) !== size).map(([filename]) => filename);
  if (missing.length || mismatched.length) {
    throw new Error(`Windows installer payload is incomplete: ${[...new Set([...missing, ...mismatched])].slice(0, 12).join(', ')}`);
  }
  return expectedFiles.size;
}

async function inventory(directory, prefix = '') {
  const files = new Map();
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const row of await inventory(filename, relative + '/')) files.set(...row);
    } else if (entry.isFile()) files.set(relative, (await fs.stat(filename)).size);
  }
  return files;
}

export async function verifyWindowsPackage(root, version) {
  const installer = path.join(root, 'release', `FlowTask-Setup-${version}.exe`);
  const files = await inventory(path.join(root, 'release', 'win-unpacked'));
  const { getPath7za } = require('app-builder-lib/out/toolsets/7zip.js');
  const archiveTool = await getPath7za();
  const options = { windowsHide: true, maxBuffer: 8 * 1024 * 1024 };
  const { stdout } = await exec(archiveTool, ['l', '-slt', '-ba', installer], options);
  const count = checkPackageEntries(stdout, files);
  // Test every compressed file's CRC, rather than only hashing the container.
  await exec(archiveTool, ['t', '-bd', installer], options);
  console.log(`Verified Windows installer: ${count} packaged files and archive integrity checks passed.`);
}

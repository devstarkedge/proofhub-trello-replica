import fs from 'node:fs/promises';
import path from 'node:path';
import { root, ensureElectron, run, electronEnvironment } from './electron-runtime.mjs';

const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
await run(await ensureElectron(), [path.join(root, 'scripts/prepare-icon.cjs')], { env: electronEnvironment() });
const stage = path.resolve(root, 'build/app');
if (!stage.startsWith(path.resolve(root) + path.sep)) throw new Error('Package staging directory is outside desktopApp.');
await fs.access(path.join(root, 'dist/index.html'));
await fs.access(path.join(root, 'dist/desktop-config.json'));
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(path.join(stage, 'electron'), { recursive: true });
await fs.cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
for (const filename of await fs.readdir(path.join(root, 'electron'))) {
  if (filename.endsWith('.cjs') && !filename.endsWith('.test.cjs')) await fs.copyFile(path.join(root, 'electron', filename), path.join(stage, 'electron', filename));
}
for (const dependency of ['uiohook-napi', 'node-gyp-build','sharp','@img','detect-libc','semver','socket.io-client','socket.io-parser','engine.io-client','engine.io-parser','@socket.io/component-emitter','debug','ms','ws','xmlhttprequest-ssl']) {
  await fs.cp(path.join(root,'node_modules',dependency),path.join(stage,'node_modules',dependency),{recursive:true});
}
// React dependencies are already in dist. Only native monitoring, image
// encoding, and the existing Socket.IO transport need main-process packages.
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
  name: manifest.name, version: manifest.version, description: manifest.description,
  author: manifest.author, main: manifest.main, private: true,
  dependencies: { 'uiohook-napi': manifest.dependencies['uiohook-napi'],sharp:manifest.dependencies.sharp,'socket.io-client':manifest.dependencies['socket.io-client'] },
}, null, 2));
console.log('Prepared desktop package:', stage);

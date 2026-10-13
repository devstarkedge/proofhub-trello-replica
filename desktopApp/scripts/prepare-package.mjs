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
  if (filename.endsWith('.cjs')) await fs.copyFile(path.join(root, 'electron', filename), path.join(stage, 'electron', filename));
}
// React dependencies are already in dist. The main process uses only Node and
// Electron built-ins, so the installed app needs no renderer node_modules.
await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
  name: manifest.name, version: manifest.version, description: manifest.description,
  author: manifest.author, main: manifest.main, private: true,
}, null, 2));
console.log('Prepared desktop package:', stage);

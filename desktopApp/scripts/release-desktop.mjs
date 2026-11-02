import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadEnv } from 'vite';
import { root, run } from './electron-runtime.mjs';
import { windowsReleaseAssets, publishWindowsRelease } from './github-release.mjs';
const require = createRequire(import.meta.url);
const semver = require('semver');
let lock, lockFile;
try {
  const resume = process.argv[3] === '--resume';
  if (process.argv[2] !== 'win' || process.argv.length !== (resume ? 4 : 3)) throw new Error('Use npm run release:win (or npm run release:win -- --resume) to publish the Windows NSIS release.');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_RELEASE_TOKEN;
  if (!token?.trim()) throw new Error('Set GH_TOKEN with repository Contents write access before publishing.');
  const rendererEnv = loadEnv('production', root, 'VITE_');
  if (Object.keys(rendererEnv).some(key => /^VITE_.*(?:TOKEN|SECRET)/i.test(key) && rendererEnv[key])) throw new Error('Remove token/secret variables with a VITE_ prefix from the environment and .env files. They must never enter the renderer bundle.');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!semver.valid(manifest.version) || semver.prerelease(manifest.version)) throw new Error('Publish a stable semantic desktop version.');
  if (execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('Commit the desktop release changes, then push that commit before publishing.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const publisher = manifest.build.publish;
  if (publisher.provider !== 'github' || publisher.owner !== 'devstarkedge' || publisher.repo !== 'proofhub-trello-replica') throw new Error('Unexpected GitHub release destination.');
  await fs.mkdir(path.join(root, 'release'), { recursive: true });
  lockFile = path.join(root, 'release', `.publish-${manifest.version}.lock`);
  lock = await fs.open(lockFile, 'wx');
  await lock.writeFile(`Publisher PID ${process.pid}\n`);
  if (!resume) await run(process.execPath, [path.join(root, 'scripts/build-desktop.mjs'), 'win']);
  if (execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8' }).trim() || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== commit) throw new Error('Desktop sources changed during the release build. Commit and rebuild before publishing.');
  const assets = windowsReleaseAssets(root, manifest.version);
  const provenance = { version: manifest.version, commit, assets: assets.map(({ name, digest, size }) => ({ name, digest, size })) };
  const provenanceFile = path.join(root, 'release', `.publish-${manifest.version}.json`);
  if (resume) {
    const previous = JSON.parse(await fs.readFile(provenanceFile, 'utf8'));
    if (JSON.stringify(previous) !== JSON.stringify(provenance)) throw new Error('The retained release artifacts do not match this release commit. Do not resume with rebuilt or changed files.');
  } else await fs.writeFile(provenanceFile, JSON.stringify(provenance));
  const url = await publishWindowsRelease({ ...publisher, version: manifest.version, commit, assets, token });
  console.log('Published FlowTask desktop release:', url);
} catch (error) {
  console.error('FlowTask release failed:', error.code === 'EEXIST' ? 'Another publisher is running for this version. If it was interrupted, review and remove its release/.publish-VERSION.lock file before retrying.' : error.message);
  process.exitCode = 1;
} finally {
  if (lock) { await lock.close(); await fs.unlink(lockFile); }
}

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

export function windowsReleaseAssets(root, version) {
  const names = [`FlowTask-Setup-${version}.exe`, `FlowTask-Setup-${version}.exe.blockmap`, 'latest.yml'];
  const directory = path.join(root, 'release');
  const metadata = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'));
  if (metadata.version !== version || metadata.path !== names[0] || !metadata.files?.some(file => file.url === names[0])) throw new Error('Update metadata does not match this version and installer.');
  const assets = names.map(name => {
    const file = path.join(directory, name), stat = fs.statSync(file);
    if (!stat.size) throw new Error(`Empty release asset: ${name}`);
    const bytes = fs.readFileSync(file);
    return { name, file, size: stat.size, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` };
  });
  const installer = fs.readFileSync(assets[0].file);
  const hash = createHash('sha512').update(installer).digest('base64');
  if (metadata.sha512 !== hash || metadata.files.find(file => file.url === names[0]).sha512 !== hash) throw new Error('Installer checksum does not match latest.yml.');
  if (metadata.files.find(file => file.url === names[0]).size !== assets[0].size) throw new Error('Installer size does not match latest.yml.');
  return assets;
}

export async function publishWindowsRelease({ owner, repo, version, commit, assets, token, fetchImpl = fetch }) {
  if (![owner, repo].every(value => /^[\w.-]+$/.test(value))) throw new Error('Invalid GitHub publisher configuration.');
  const base = `https://api.github.com/repos/${owner}/${repo}`, tag = `v${version}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'FlowTask-release' };
  const request = async (url, options = {}) => {
    const response = await fetchImpl(url, { ...options, redirect: 'error', headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok) throw new Error(`GitHub release request failed (${response.status}). Retry safely; existing assets and releases are retained.`);
    return response.json();
  };
  const matching = [];
  for (let page = 1; page <= 10; page++) {
    const releases = await request(`${base}/releases?per_page=100&page=${page}`);
    matching.push(...releases.filter(release => release.tag_name === tag));
    if (releases.length < 100) break;
    if (page === 10) throw new Error('Release history exceeds the safe inspection limit. Archive or review releases before retrying.');
  }
  if (matching.length > 1) throw new Error(`Multiple releases already exist for ${tag}. Consolidate them in GitHub before retrying; no duplicate release or asset was deleted.`);
  let release = matching[0];
  if (release && (!release.draft || release.prerelease)) throw new Error(`${tag} already exists as a published or prerelease version. Bump the desktop version before publishing.`);
  if (release && release.target_commitish !== commit) {
    let { object } = await request(`${base}/git/ref/tags/${tag}`);
    for (let depth = 0; object.type === 'tag' && depth < 3; depth++) ({ object } = await request(`${base}/git/tags/${object.sha}`));
    if (object.type !== 'commit' || object.sha !== commit) throw new Error('The existing draft tag does not point to this release commit. Existing releases are retained.');
  }
  if (!release) {
    await request(`${base}/git/commits/${commit}`); // Require a pushed release commit.
    // An atomic, unique Git ref is the cross-machine creation lock. A competing
    // publisher cannot create a second draft for an unclaimed version/tag.
    await request(`${base}/git/refs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: commit }) });
    release = await request(`${base}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: commit, name: tag, draft: true, prerelease: false }) });
  }
  let existing = await request(`${base}/releases/${release.id}/assets?per_page=100`);
  const upload = new URL(release.upload_url.replace(/\{.*$/, ''));
  if (upload.protocol !== 'https:' || upload.hostname !== 'uploads.github.com') throw new Error('Unexpected GitHub upload destination.');
  // latest.yml is deliberately last; the draft is published only after all
  // three assets are present and their exact digests have been verified.
  for (const asset of assets) {
    const same = existing.filter(value => value.name === asset.name);
    if (same.length) {
      if (same.length !== 1 || same[0].digest !== asset.digest || same[0].size !== asset.size) throw new Error(`Existing ${asset.name} has different contents. Existing assets are retained; rebuild with a new version or review the draft.`);
      continue;
    }
    const url = new URL(upload); url.searchParams.set('name', asset.name);
    await request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(asset.size) }, body: fs.createReadStream(asset.file), duplex: 'half' });
  }
  existing = await request(`${base}/releases/${release.id}/assets?per_page=100`);
  for (const asset of assets) if (!existing.some(value => value.name === asset.name && value.digest === asset.digest && value.size === asset.size)) throw new Error('GitHub assets could not be verified. The release remains a draft.');
  const published = await request(`${base}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, prerelease: false, make_latest: 'true' }) });
  if (published.draft || published.prerelease || published.tag_name !== tag) throw new Error('GitHub did not confirm the expected stable published release.');
  return published.html_url;
}

const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
const { navigationOrigin } = require('../electron/app-navigation.cjs');

function verifyNavigationPackage({ root, archive, product }) {
  const configName = product === 'FlowTask' ? 'dist/desktop-config.json' : 'dist/desktop-navigation.json';
  const read = relative => {
    try { return asar.extractFile(archive, path.normalize(relative)); }
    catch { throw new Error(`Windows desktop navigation payload is incomplete: ${relative}`); }
  };
  const config = JSON.parse(read(configName).toString());
  navigationOrigin(product === 'FlowTask' ? config.chatOrigin : config.peerOrigin, true);
  for (const origin of config.peerOrigins || []) navigationOrigin(origin, true);
  const expected = ['electron/main.cjs', 'electron/preload.cjs', 'electron/app-navigation.cjs', configName, 'dist/index.html'];
  const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']\.?\/?([^"']+\.js)["']/g)]
    .map(match => 'dist/' + match[1]);
  if (!scripts.length || scripts.some(script => !/^dist\/assets\/[\w.-]+\.js$/.test(script))) {
    throw new Error('Windows desktop renderer entry could not be verified.');
  }
  expected.push(...scripts);
  for (const relative of expected) {
    if (!read(relative).equals(fs.readFileSync(path.join(root, relative)))) {
      throw new Error(`Windows package contains stale navigation or renderer code: ${relative}`);
    }
  }
  if (!scripts.some(script => /\.takePending\(/.test(read(script).toString()))) {
    throw new Error('Windows renderer is missing the desktop navigation bridge.');
  }
  return expected.length;
}

module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const count = verifyNavigationPackage({ root: context.packager.projectDir,
    archive: path.join(context.appOutDir, 'resources/app.asar'), product: context.packager.appInfo.productName });
  console.log(`Verified Windows navigation configuration and ${count} packaged renderer/main files.`);
};
module.exports.verifyNavigationPackage = verifyNavigationPackage;

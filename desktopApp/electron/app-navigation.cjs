const fs = require('node:fs');
const { spawn: spawnProcess } = require('node:child_process');

// Kept identical in both desktop distributions; neither installer depends on
// files from the other repository. The web URL remains the fallback authority.
function internalRoute(value) {
  if (typeof value !== 'string' || value.length > 12000 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\s]/.test(value) || /\p{Cc}/u.test(value)) return null;
  try {
    return new URL(value, 'https://navigation.invalid').origin === 'https://navigation.invalid' ? value : null;
  } catch { return null; }
}

function webTarget(value, peerOrigin) {
  try {
    const url = new URL(value);
    const peer = new URL(peerOrigin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== peer.origin || url.username || url.password ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) return null;
    return internalRoute(url.pathname + url.search + url.hash);
  } catch { return null; }
}

function parseDeepLink(value, scheme) {
  if (typeof value !== 'string' || value.length > 40000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== `${scheme}:` || url.hostname !== 'navigate' || url.port ||
        url.username || url.password || !['', '/'].includes(url.pathname) || url.hash ||
        [...url.searchParams.keys()].some(key => key !== 'route') || url.searchParams.getAll('route').length !== 1) return null;
    return internalRoute(url.searchParams.get('route'));
  } catch { return null; }
}

function makeDeepLink(route, scheme) {
  if (!internalRoute(route)) throw new Error('Invalid navigation route');
  return `${scheme}://navigate?route=${encodeURIComponent(route)}`;
}

async function openPeer(value, { app, shell, peerOrigin, peerScheme, platform = process.platform,
  isFile = filename => fs.statSync(filename).isFile(), spawn = spawnProcess }) {
  const route = webTarget(value, peerOrigin);
  if (!route || platform !== 'win32') return false;
  const launch = async (url, handler) => {
    // Electron's Windows ShellExecute wrapper accepts at most 2081 characters.
    // Large signed SSO payloads must not be truncated or dropped. Resolve the
    // registered executable and pass the complete URL as a single argument,
    // without a command shell. The receiver still consumes the custom URL.
    if (url.length <= 2081) return shell.openExternal(url);
    const application = handler || await app.getApplicationInfoForProtocol(url);
    if (!application?.path || !isFile(application.path) || url.length > 30000) throw new Error('Navigation unavailable');
    await new Promise((resolve, reject) => {
      const child = spawn(application.path, ['--', url], { detached: true, windowsHide: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  };
  try {
    // A successful openExternal(customScheme) is not an installation check.
    // Query Windows' effective association and reject stale/uninstalled paths.
    const handler = await app.getApplicationInfoForProtocol(`${peerScheme}://`);
    if (!handler?.path || !isFile(handler.path)) throw new Error('Desktop app unavailable');
    await launch(makeDeepLink(route, peerScheme), handler);
  } catch {
    // No timeout/blur heuristics: missing association, stale executable, and
    // ShellExecute failures all open the original, unmodified web destination.
    await launch(value);
  }
  return true;
}

function installNavigation({ app, ipcMain, getWindow, trusted, ownScheme, argv = process.argv,
  platform = process.platform, register = app.isPackaged }) {
  let pending = null;
  const channel = 'app-navigation';
  const takeArguments = args => {
    if (platform !== 'win32') return;
    for (const argument of args) {
      const route = parseDeepLink(argument, ownScheme);
      if (route) pending = route; // Bounded: the most recent requested destination wins.
    }
  };
  const notify = () => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    if (pending) window.webContents.send(`${channel}:pending`);
  };
  takeArguments(argv);
  if (platform === 'win32') {
    // Installers own registration. Packaged first launch repairs upgrades;
    // development/isolated previews must never hijack an installed association.
    if (register) app.setAsDefaultProtocolClient(ownScheme, process.execPath, ['--']);
    app.on('second-instance', (_event, args) => { takeArguments(args); notify(); });
    ipcMain.handle(`${channel}:take`, event => {
      const window = getWindow();
      if (!window || event.sender !== window.webContents ||
          event.senderFrame !== event.sender.mainFrame || !trusted(event.senderFrame.url)) return null;
      const route = pending;
      pending = null;
      return route;
    });
  }
  return { notify };
}

module.exports = { internalRoute, webTarget, parseDeepLink, makeDeepLink, openPeer, installNavigation };

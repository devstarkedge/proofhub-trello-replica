// Run with Electron, not Node. Uses disposable protocol names/profiles, never
// the real app associations or saved accounts. Browser opening is intercepted.
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const receiver = option('receiver');
const root = option('fixture-root') || path.join(app.getPath('temp'), `flowtask-navigation-${process.pid}`);
const script = __filename;
if (process.platform !== 'win32') throw new Error('This check requires Windows.');
fs.mkdirSync(root, { recursive: true });
app.setPath('userData', path.join(root, receiver || 'driver'));

const waitUntil = async predicate => {
  const deadline = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Navigation fixture timed out');
    await new Promise(resolve => setTimeout(resolve, 75));
  }
};
const reportFile = scheme => path.join(root, `${scheme}.json`);

if (receiver) {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  setTimeout(() => app.quit(), 45000).unref();
  const { installNavigation } = require(option('helper'));
  let window;
  const html = path.join(root, 'receiver.html');
  app.on('second-instance', (_event, args) => { if (args.includes('--fixture-quit')) app.quit(); });
  installNavigation({ app, ipcMain, getWindow: () => window, ownScheme: receiver, register: false,
    trusted: url => url === pathToFileURL(html).href });
  ipcMain.on('fixture:received', (_event, route) => {
    const prior = fs.existsSync(reportFile(receiver)) ? JSON.parse(fs.readFileSync(reportFile(receiver))) : { routes: [] };
    fs.writeFileSync(reportFile(receiver), JSON.stringify({ pid: process.pid, windows: BrowserWindow.getAllWindows().length,
      focused: window.isFocused(), routes: [...prior.routes, route] }));
  });
  app.whenReady().then(async () => {
    window = new BrowserWindow({ width: 400, height: 200, show: false,
      webPreferences: { preload: path.join(root, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.once('did-finish-load', () => fs.writeFileSync(path.join(root, `${receiver}.ready`), 'ready'));
    await window.loadFile(html);
  });
} else {
  const schemes = [];
  const children = [];
  app.whenReady().then(async () => {
    fs.writeFileSync(path.join(root, 'receiver.html'), '<!doctype html><title>Navigation test</title><p>Disposable navigation verification</p>');
    fs.writeFileSync(path.join(root, 'preload.cjs'), `const {ipcRenderer}=require('electron');
      const drain=()=>ipcRenderer.invoke('app-navigation:take').then(route=>{if(route)ipcRenderer.send('fixture:received',route);});
      ipcRenderer.on('app-navigation:pending',drain);window.addEventListener('DOMContentLoaded',drain);`);
    const helpers = [path.resolve(__dirname, '../electron/app-navigation.cjs'),
      path.resolve(__dirname, '../../../ChatApp/chat-desktop/electron/app-navigation.cjs')];
    for (let index = 0; index < helpers.length; index++) {
      const helper = helpers[index];
      const { openPeer } = require(helper);
      const scheme = `flowtask-navigation-test-${process.pid}-${index}`;
      schemes.push(scheme);
      const args = [script, `--fixture-root=${root}`, `--receiver=${scheme}`, `--helper=${helper}`, '--'];
      assert.equal(app.setAsDefaultProtocolClient(scheme, process.execPath, args), true);
      const installed = await app.getApplicationInfoForProtocol(`${scheme}://`);
      assert.equal(path.resolve(installed.path).toLowerCase(), path.resolve(process.execPath).toLowerCase());
      const cold = '/workspace/one/channel/two?thread=three&filter=a%26b#message';
      await openPeer('https://navigation.test' + cold, { app, shell, peerOrigin: 'https://navigation.test', peerScheme: scheme });
      await waitUntil(() => fs.existsSync(reportFile(scheme)));
      const first = JSON.parse(fs.readFileSync(reportFile(scheme)));
      children.push(first.pid);
      assert.deepEqual(first.routes, [cold]);
      const warm = '/workflow/dept/project/task?workspaceId=aaaaaaaaaaaaaaaaaaaaaaaa#comment';
      await openPeer('https://navigation.test' + warm, { app, shell, peerOrigin: 'https://navigation.test', peerScheme: scheme });
      await waitUntil(() => JSON.parse(fs.readFileSync(reportFile(scheme))).routes.length === 2);
      const second = JSON.parse(fs.readFileSync(reportFile(scheme)));
      assert.equal(second.pid, first.pid);
      assert.equal(second.windows, 1);
      assert.equal(second.focused, true);
      assert.deepEqual(second.routes, [cold, warm]);
      const opened = [];
      assert.equal(app.removeAsDefaultProtocolClient(scheme, process.execPath, args), true);
      await openPeer('https://navigation.test' + warm, { app, shell: { openExternal: async url => opened.push(url) },
        peerOrigin: 'https://navigation.test', peerScheme: scheme });
      assert.deepEqual(opened, ['https://navigation.test' + warm]);
      const stale = [];
      await openPeer('https://navigation.test' + cold, {
        app: { getApplicationInfoForProtocol: async () => ({ path: path.join(root, 'uninstalled.exe') }) },
        shell: { openExternal: async url => stale.push(url) }, peerOrigin: 'https://navigation.test', peerScheme: scheme });
      assert.deepEqual(stale, ['https://navigation.test' + cold]);
      console.log(JSON.stringify({ helper: index === 0 ? 'FlowTask' : 'ChatApp', coldLaunch: true,
        runningReuse: true, focused: true, windows: second.windows, missingFallback: true, staleFallback: true }));
    }
    console.log('Windows navigation OS checks passed. Browser fallback URLs were intercepted, not opened.');
  }).catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => {
    for (const scheme of schemes) app.removeAsDefaultProtocolClient(scheme);
    for (const pid of children) { try { process.kill(pid); } catch { /* Already exited. */ } }
    app.exit(process.exitCode || 0);
  });
}

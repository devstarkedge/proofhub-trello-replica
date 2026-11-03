const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createUpdateManager } = require('./update-manager.cjs');

function installDesktopUpdates({ app, ipcMain, getWindow, getOrigin, tracking, webRequest, disabled = false }) {
  let enabled = app.isPackaged && process.platform === 'win32' && !disabled;
  let updater = null;
  let exitPending = false, bypassExit = false, networkLocked = false, rendererWait = null, lastCheck = 0;
  const mutations = new Set(), logFile = path.join(app.getPath('userData'), 'updater.log');
  const log = message => {
    try { if (fs.existsSync(logFile) && fs.statSync(logFile).size > 512 * 1024) fs.renameSync(logFile, logFile + '.old'); fs.appendFileSync(logFile, `${new Date().toISOString()} ${String(message).slice(0, 500)}\n`); } catch { /* Logging cannot affect work. */ }
  };
  if (enabled) {
    try { updater = require('./updater-runtime.cjs').autoUpdater; }
    catch { enabled = false; log('Update runtime could not be loaded; the application remains available'); }
  }
  // Never log HTTP errors/headers, signed download URLs, credentials or local paths.
  if (updater) updater.logger = { info: () => {}, warn: () => log('Updater warning'), error: () => log('Updater error'), debug: () => {} };
  const trusted = event => {
    try { const win = getWindow(); return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame && new URL(event.senderFrame.url).origin === getOrigin(); } catch { return false; }
  };
  function send(channel, value) { try { const win = getWindow(); if (win && !win.isDestroyed() && !win.webContents.isDestroyed?.()) win.webContents.send(channel, value); } catch { /* A closing/crashed renderer cannot crash update handling. */ } }
  function publish(value) { send('desktop-updates:status', value); }
  function releaseHold() { networkLocked = false; tracking.releaseUpdateHold(); publish(manager.snapshot()); send('desktop-updates:release'); }
  async function rendererSafety() {
    const win = getWindow();
    if (!win || win.isDestroyed() || win.webContents.isLoadingMainFrame()) return { safe: false, reason: 'Wait for FlowTask to finish loading, then retry.' };
    return new Promise(resolve => {
      const requestId = randomUUID();
      const timer = setTimeout(() => { rendererWait = null; resolve({ safe: false, reason: 'The application could not confirm a safe restart. Please retry.' }); }, 8000);
      rendererWait = { requestId, finish: value => { clearTimeout(timer); rendererWait = null; resolve(value); } };
      win.webContents.send('desktop-updates:prepare', requestId);
    });
  }
  const manager = createUpdateManager({ updater, enabled, version: app.getVersion(), log, publish,
    readiness: async () => {
      if (mutations.size) return { safe: false, reason: 'Uploads or saved changes are still being sent. Waiting for them to finish.' };
      return tracking.updateSafety();
    },
    safety: async () => {
      try {
        networkLocked = true;
        const renderer = await rendererSafety();
        if (!renderer.safe) { releaseHold(); return renderer; }
        if (mutations.size) { releaseHold(); return { safe: false, reason: 'Uploads or saved changes are still being sent. Please retry shortly.' }; }
        const native = await tracking.updateSafety();
        if (!native.safe || renderer.authenticated && !native.configured) { releaseHold(); return { safe: false, reason: native.reason || 'Wait for your desktop session to connect before restarting.' }; }
        const held = tracking.holdForUpdate();
        if (!held.safe || mutations.size) { releaseHold(); return { safe: false, reason: held.reason || 'Synchronization is still running. Please retry.' }; }
        // Recheck renderer queues after the asynchronous server verification.
        const final = await rendererSafety();
        if (!final.safe) releaseHold();
        return final;
      } catch (error) {
        releaseHold();
        throw error;
      }
    },
    install: async normalExit => {
      try {
        await tracking.prepareUpdateShutdown();
        bypassExit = true;
        updater.quitAndInstall(true, !normalExit);
        if (!updater.quitAndInstallCalled) throw new Error('Installer did not start');
      } catch (error) {
        bypassExit = false;
        await tracking.resumeAfterUpdateFailure(); releaseHold();
        throw error;
      }
    }
  });
  const guard = handler => (event, ...args) => { if (!trusted(event)) throw new Error('Untrusted update sender'); return handler(...args); };
  ipcMain.handle('desktop-updates:status', guard(() => manager.snapshot()));
  ipcMain.handle('desktop-updates:check', guard(() => { if (Date.now() - lastCheck < 10000) return manager.snapshot(); lastCheck = Date.now(); void manager.check(true); return manager.snapshot(); }));
  ipcMain.handle('desktop-updates:later', guard(() => manager.later()));
  ipcMain.handle('desktop-updates:restart', guard(async () => { if (manager.snapshot().phase === 'installing') return manager.snapshot(); const result = await manager.restart(false); if (!result) releaseHold(); return manager.snapshot(); }));
  const prepared = (event, value) => {
    if (!trusted(event) || !rendererWait || value?.requestId !== rendererWait.requestId || typeof value.safe !== 'boolean' || typeof value.authenticated !== 'boolean') return;
    rendererWait.finish({ safe: value.safe, authenticated: value.authenticated, reason: value.safe ? '' : 'Save pending changes and verify any interrupted attendance/work action before restarting.' });
  };
  ipcMain.on('desktop-updates:prepared', prepared);
  // Observe only request identifiers; no request body, auth headers or workspace
  // data cross the update bridge. Block new writes during the short restart gate.
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  webRequest.onBeforeRequest(filter, (details, callback) => {
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(details.method);
    if (mutation && networkLocked) { callback({ cancel: true }); return; }
    if (mutation) mutations.add(details.id);
    callback({});
  });
  webRequest.onCompleted(filter, details => mutations.delete(details.id));
  webRequest.onErrorOccurred(filter, details => mutations.delete(details.id));
  async function normalExit() {
    if (exitPending) return;
    exitPending = true;
    const installed = await manager.restart(true);
    if (!installed) { releaseHold(); bypassExit = true; exitPending = false; app.quit(); }
  }
  function beforeQuit(event) {
    if (bypassExit || !enabled || !['downloaded', 'installing'].includes(manager.snapshot().phase)) return;
    event.preventDefault(); if (manager.snapshot().phase !== 'installing') void normalExit();
  }
  app.prependListener('before-quit', beforeQuit);
  const attachWindow = win => win.on('close', event => {
    if (!bypassExit && enabled && ['downloaded', 'installing'].includes(manager.snapshot().phase)) { event.preventDefault(); if (manager.snapshot().phase !== 'installing') void normalExit(); }
  });
  app.once('will-quit', () => {
    rendererWait?.finish({ safe: false, authenticated: false });
    manager.dispose();
    ipcMain.removeListener('desktop-updates:prepared', prepared);
    app.removeListener('before-quit', beforeQuit);
    for (const name of ['status', 'check', 'later', 'restart']) ipcMain.removeHandler(`desktop-updates:${name}`);
    webRequest.onBeforeRequest(null); webRequest.onCompleted(null); webRequest.onErrorOccurred(null);
  });
  return { attachWindow, isHandlingExit: () => exitPending || manager.snapshot().phase === 'installing', status: manager.snapshot };
}
module.exports = { installDesktopUpdates };

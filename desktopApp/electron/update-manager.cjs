const semver = require('semver');
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const RESTART_RETRY_MS = 15000;

// No Electron globals: the lifecycle and safety contract can be verified without
// downloading/installing a release or touching a real person's tracking state.
function createUpdateManager({ updater, version, enabled, readiness = async () => ({ safe: true }), safety, install, publish = () => {}, log = () => {}, timers = globalThis }) {
  let state = { enabled, phase: enabled ? 'idle' : 'disabled', currentVersion: version, version: null, progress: 0, dismissed: false, message: '', manual: false, restartPending: false, restartMode: null, restartStage: null, restartOnExit: false, revision: 0 };
  let checking = null, downloading = null, installing = null, interval, startup, retryTimer, restartTimer, disposed = false, failures = 0;
  let restartRequest = 0;
  const listeners = [];
  const snapshot = () => ({ ...state });
  const change = patch => { if (disposed) return; state = { ...state, ...patch, revision: state.revision + 1 }; publish(snapshot()); };
  const on = (event, callback) => { updater.on(event, callback); listeners.push([event, callback]); };
  const newer = info => Boolean(semver.valid(info?.version) && !semver.prerelease(info.version) && semver.gt(info.version, version));
  const fail = () => {
    if (disposed) return;
    failures++;
    change({ phase: 'error', message: 'The update could not be completed. Check your connection and retry.' });
    log('Update operation failed');
    if (failures <= 2 && !retryTimer) {
      retryTimer = timers.setTimeout(() => { retryTimer = null; void check(false); }, failures * 60000);
      retryTimer?.unref?.();
    }
  };
  function download() {
    if (disposed || downloading || !enabled || !newer({ version: state.version }) || ['downloaded', 'installing'].includes(state.phase)) return downloading;
    change({ phase: 'downloading', progress: 0, message: '' });
    downloading = Promise.resolve().then(() => updater.downloadUpdate()).catch(fail).finally(() => { downloading = null; });
    return downloading;
  }
  function check(manual = true) {
    if (disposed || !enabled || checking || downloading || ['downloaded', 'installing'].includes(state.phase)) return checking || downloading || Promise.resolve(snapshot());
    if (manual) { failures = 0; if (retryTimer) timers.clearTimeout(retryTimer); retryTimer = null; }
    change({ phase: 'checking', message: '', manual, dismissed: manual ? false : state.dismissed });
    checking = Promise.resolve().then(() => updater.checkForUpdates()).then(result => {
      if (!disposed && state.phase === 'checking' && !newer(result?.updateInfo)) change({ phase: 'up-to-date', message: '' });
      return snapshot();
    }).catch(fail).finally(() => { checking = null; });
    return checking;
  }
  function deferRestart(result) {
    change({ phase: 'downloaded', restartStage: state.restartPending ? 'waiting' : null, restartOnExit: false, message: result.reason || 'Finish active work and pending operations before restarting.' });
    return false;
  }
  async function restart(normalExit = false, scheduled = false) {
    if (state.phase === 'installing') return installing || false;
    if (disposed || !enabled || state.phase !== 'downloaded') return false;
    if (scheduled && !state.restartPending) return false;
    timers.clearTimeout(restartTimer); restartTimer = null;
    if (!normalExit && !scheduled && (!state.restartPending || state.restartMode !== 'now')) {
      restartRequest++;
      change({ restartPending: true, restartMode: 'now', restartStage: 'requested', dismissed: false, message: '' });
    }
    if (installing) return installing;
    const request = restartRequest;
    const options = { allowActive: !normalExit && state.restartMode === 'now' };
    // Assign the task before running callbacks so repeated clicks coalesce.
    installing = Promise.resolve().then(async () => {
      try {
        // While work is active, poll without freezing UI or blocking requests.
        if (request === restartRequest && state.restartStage === 'requested') change({ restartStage: 'waiting' });
        const ready = await readiness(options);
        if (disposed || request !== restartRequest || !normalExit && !state.restartPending) return false;
        if (!ready.safe) return deferRestart(ready);
        change({ phase: 'installing', restartStage: 'preparing', restartOnExit: normalExit, message: '', dismissed: false });
        const result = await safety(options);
        if (disposed) return false;
        if (!result.safe) return deferRestart(result);
        await install(normalExit);
        change({ restartStage: 'restarting' });
        return true;
      } catch {
        // The verified cached installer remains available for another attempt.
        change({ phase: 'downloaded', restartPending: false, restartStage: 'failed', restartOnExit: false, message: 'FlowTask could not safely restart. The update is still downloaded. Try restarting again.' });
        return false;
      } finally {
        installing = null;
        if (!disposed && state.restartPending && state.phase === 'downloaded') {
          restartTimer = timers.setTimeout(() => {
            restartTimer = null;
            if (state.restartPending) void restart(false, true);
          }, request === restartRequest ? RESTART_RETRY_MS : 0);
          restartTimer?.unref?.();
        }
      }
    });
    return installing;
  }
  if (enabled) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    on('update-available', info => {
      if (downloading || ['downloaded', 'installing'].includes(state.phase)) return;
      if (!newer(info)) { change({ phase: 'up-to-date', version: null }); return; }
      const different = state.version !== info.version;
      change({ phase: 'available', version: info.version, dismissed: different ? false : state.dismissed, message: '' });
      void download();
    });
    on('update-not-available', () => { failures = 0; change({ phase: 'up-to-date', version: null, message: '' }); });
    on('download-progress', value => change({ phase: 'downloading', progress: Math.max(0, Math.min(100, Number(value.percent) || 0)) }));
    on('update-downloaded', info => {
      if (!newer(info)) return;
      failures = 0;
      if (retryTimer) timers.clearTimeout(retryTimer); retryTimer = null;
      change({ phase: 'downloaded', version: info.version, progress: 100, message: '' });
      log(`Update ${info.version} verified and ready; installation requires a safe exit`);
    });
    // Promise rejections drive retries. The emitter's error event must always
    // have a listener, but must not count the same failed request twice.
    on('error', () => { log('Updater reported an error'); if (!checking && !downloading && state.phase !== 'installing') fail(); });
    startup = timers.setTimeout(() => { void check(false); }, 10000); startup?.unref?.();
    interval = timers.setInterval(() => { void check(false); }, FOUR_HOURS); interval?.unref?.();
  }
  return { snapshot, check, restart, later: () => {
    if (state.phase === 'downloaded') {
      restartRequest++;
      change({ dismissed: false, restartPending: true, restartMode: 'idle', restartStage: 'requested', message: '' });
      void restart(false, true);
    } else if (state.phase !== 'installing') change({ dismissed: true });
    return snapshot();
  }, cancel: () => {
    if (state.phase !== 'installing') { restartRequest++; timers.clearTimeout(restartTimer); restartTimer = null; change({ dismissed: false, restartPending: false, restartMode: null, restartStage: null, message: '' }); }
    return snapshot();
  },
    dispose() { disposed = true; timers.clearTimeout(startup); timers.clearTimeout(retryTimer); timers.clearTimeout(restartTimer); timers.clearInterval(interval); for (const [event, callback] of listeners) updater.removeListener(event, callback); }
  };
}
module.exports = { createUpdateManager, FOUR_HOURS, RESTART_RETRY_MS };

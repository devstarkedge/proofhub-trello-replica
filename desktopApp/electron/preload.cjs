const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowtaskDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  updates: Object.freeze({
    getStatus: () => ipcRenderer.invoke('desktop-updates:status'),
    check: () => ipcRenderer.invoke('desktop-updates:check'),
    restart: () => ipcRenderer.invoke('desktop-updates:restart'),
    later: () => ipcRenderer.invoke('desktop-updates:later'),
    onStatus: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('desktop-updates:status', listener);
      return () => ipcRenderer.removeListener('desktop-updates:status', listener);
    },
    onPrepare: callback => {
      const listener = (_event, requestId) => callback(requestId);
      ipcRenderer.on('desktop-updates:prepare', listener);
      return () => ipcRenderer.removeListener('desktop-updates:prepare', listener);
    },
    prepared: value => ipcRenderer.send('desktop-updates:prepared', value),
    onRelease: callback => {
      const listener = () => callback();
      ipcRenderer.on('desktop-updates:release', listener);
      return () => ipcRenderer.removeListener('desktop-updates:release', listener);
    }
  }),
  tracking: Object.freeze({
    configure: value => ipcRenderer.invoke('desktop-tracking:configure', value),
    getStatus: () => ipcRenderer.invoke('desktop-tracking:status'),
    refresh: () => ipcRenderer.invoke('desktop-tracking:refresh'),
    transitionSession:value=>ipcRenderer.invoke('desktop-tracking:transition',value),
    retryUploads: () => ipcRenderer.invoke('desktop-tracking:retry-uploads'),
    claimMonitoring: () => ipcRenderer.invoke('desktop-tracking:claim-monitoring'),
    policyChanged: value => ipcRenderer.invoke('desktop-tracking:policy',value),
    finalizeSession: value => ipcRenderer.invoke('desktop-tracking:finalize-session',value),
    stop: () => ipcRenderer.invoke('desktop-tracking:stop'),
    acceptNotice: value => ipcRenderer.invoke('desktop-tracking:notice',value),
    recoverPermissions: () => ipcRenderer.invoke('desktop-tracking:permissions'),
    onStatus: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('desktop-tracking:status', listener);
      return () => ipcRenderer.removeListener('desktop-tracking:status', listener);
    },
  }),
  notifications: Object.freeze({
    setSession: value => ipcRenderer.invoke('desktop-notifications:session', value),
    show: value => ipcRenderer.invoke('desktop-notifications:show', value),
    takePendingClick: () => ipcRenderer.invoke('desktop-notifications:pending'),
    onClick: callback => {
      const listener = (_event, id) => callback(id);
      ipcRenderer.on('desktop-notifications:click', listener);
      return () => ipcRenderer.removeListener('desktop-notifications:click', listener);
    },
  }),
  setNativeTheme: mode => ipcRenderer.send('desktop-theme:set', mode),
}));
ipcRenderer.on('desktop-notifications:resume', () => window.dispatchEvent(new Event('desktop-resume')));

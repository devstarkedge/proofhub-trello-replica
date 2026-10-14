const { app, ipcMain, Notification, nativeImage, powerMonitor } = require('electron');
const path = require('node:path');

// No token, arbitrary URL, filesystem or general IPC access is exposed.
function installDesktopNotifications(getWindow, getOrigin) {
  let session = null, pendingClick = null;
  const shown = new Map();
  const trusted = (event) => {
    const window = getWindow();
    return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === getOrigin();
  };
  const clear = () => { for (const notification of shown.values()) notification?.close(); shown.clear(); pendingClick = null; };
  ipcMain.handle('desktop-notifications:session', (event, value) => {
    if (!trusted(event)) throw new Error('Untrusted notification sender');
    if (value && (!/^[a-f\d]{24}$/i.test(value.userId) || !/^[a-f\d]{24}$/i.test(value.workspaceId) || typeof value.enabled !== 'boolean')) throw new Error('Invalid notification session');
    if (session?.userId !== value?.userId || session?.workspaceId !== value?.workspaceId || !value?.enabled) clear();
    session = value; return Notification.isSupported();
  });
  ipcMain.handle('desktop-notifications:show', (event, value) => {
    if (!trusted(event)) throw new Error('Untrusted notification sender');
    const window = getWindow();
    if (!session?.enabled || !Notification.isSupported() || value?.userId !== session.userId || value?.workspaceId !== session.workspaceId ||
      typeof value.id !== 'string' || !/^[a-f\d]{24}$/i.test(value.id) || typeof value.title !== 'string' || typeof value.body !== 'string') return false;
    if (shown.has(value.id) || (window.isFocused() && window.isVisible() && !window.isMinimized())) return false;
    const notification = new Notification({ title: value.title.slice(0, 120), body: value.body.slice(0, 500),
      icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'dist/Fav.png')), silent: false });
    const scope = session.userId + ':' + session.workspaceId;
    notification.on('click', () => {
      if (scope !== session?.userId + ':' + session?.workspaceId) return;
      pendingClick = value.id;
      if (window.isMinimized()) window.restore();
      window.show(); window.focus();
      window.webContents.send('desktop-notifications:click', value.id);
    });
    notification.on('failed', () => console.warn('Native notification delivery unavailable'));
    shown.set(value.id, notification);
    if (shown.size > 500) { const first = shown.keys().next().value; shown.get(first)?.close(); shown.delete(first); }
    notification.show(); return true;
  });
  ipcMain.handle('desktop-notifications:pending', (event) => {
    if (!trusted(event)) return null;
    const value = pendingClick; pendingClick = null; return value;
  });
  powerMonitor.on('resume', () => { const window = getWindow(); if (window && !window.isDestroyed()) window.webContents.send('desktop-notifications:resume'); });
  app.on('before-quit', clear);
}
module.exports = { installDesktopNotifications };

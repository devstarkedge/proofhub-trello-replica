const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { readBackendURL } = require('./config.cjs');
const { startDesktopServer } = require('./server.cjs');
const { installDesktopNotifications } = require('./notifications.cjs');
const { installDesktopTracking } = require('./tracking.cjs');

app.setName('FlowTask');
if (process.platform === 'win32') app.setAppUserModelId('com.flowtask.desktop');
const smokeTest = process.argv.includes('--smoke-test');
const isolatedTestProfile = !app.isPackaged && process.argv.includes('--isolated-test-profile');
// Smoke verification must not reuse or modify a person's saved desktop session.
if (smokeTest) app.setPath('userData', path.join(app.getPath('temp'), `flowtask-smoke-${process.pid}`));
else if(isolatedTestProfile)app.setPath('userData',path.join(app.getPath('temp'),`flowtask-live-test-${process.pid}`));
let mainWindow;
let localServer;
let rendererOrigin;
const root = path.join(__dirname, '..');
const hasLock = app.requestSingleInstanceLock();

// Apply to every window, including previews/popups and recreated windows.
// Chromium still handles standard text-editing shortcuts without a menu.
app.on('browser-window-created', (_event, window) => {
  if (process.platform === 'darwin') return;
  window.setMenu(null);
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt || input.meta) return;
    const key = input.key.toLowerCase();
    const contents = window.webContents;
    let action;
    if (key === 'f5' || (input.control && key === 'r')) {
      action = () => input.shift ? contents.reloadIgnoringCache() : contents.reload();
    } else if (!app.isPackaged && (key === 'f12' || (input.control && input.shift && key === 'i'))) {
      action = () => contents.toggleDevTools();
    } else if (key === 'f11') {
      action = () => window.setFullScreen(!window.isFullScreen());
    } else if (input.control && ['+', '=', '-', '0'].includes(key)) {
      action = () => contents.setZoomLevel(key === '0' ? 0 : Math.max(-3, Math.min(5,
        contents.getZoomLevel() + (key === '-' ? -0.5 : 0.5))));
    } else if (input.control && key === 'w') {
      action = () => window.close();
    } else if (input.control && key === 'q') {
      action = () => app.quit();
    }
    if (action) { event.preventDefault(); action(); }
  });
});

function openExternal(url) {
  try {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) {
      shell.openExternal(url).catch((error) => console.error('Cannot open link:', error.message));
    }
  } catch { /* Invalid and privileged URLs are deliberately ignored. */ }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'FlowTask', width: 1440, height: 940, minWidth: 1000, minHeight: 700,
    backgroundColor: '#ffffff', show: false,
    icon: path.join(root, 'dist/Fav.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      backgroundThrottling: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  const contents = mainWindow.webContents;
  const rendererErrors = [];
  const securityWarnings = [];
  contents.on('console-message', (event) => {
    if (/Electron Security Warning|Insecure Content-Security-Policy/i.test(event.message)) securityWarnings.push(event.message);
    if (event.level === 'error') {
      rendererErrors.push(event.message);
      console.error('Renderer:', event.message);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    // PDF previews and other app-owned blob windows remain sandboxed.
    if (url === 'about:blank' || url.startsWith(`blob:${rendererOrigin}/`)) {
      return { action: 'allow', overrideBrowserWindowOptions: {
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      } };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== rendererOrigin) {
      event.preventDefault();
      openExternal(url);
    }
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trusted = webContents === mainWindow?.webContents && details.requestingUrl?.startsWith(`${rendererOrigin}/`);
    callback(Boolean(trusted && ['notifications', 'fullscreen'].includes(permission)));
  });
  contents.session.setPermissionCheckHandler((webContents, permission, origin) =>
    webContents === mainWindow?.webContents && origin === rendererOrigin && ['notifications', 'fullscreen'].includes(permission));
  contents.on('render-process-gone', (_event, details) => console.error('FlowTask renderer stopped:', details.reason));
  await mainWindow.loadURL(rendererOrigin);

  if (smokeTest) {
    const result = await contents.executeJavaScript(`new Promise((resolve, reject) => {
      const deadline = Date.now() + 30000;
      const check = async () => {
        if (document.querySelector('input[type="email"]') && document.querySelector('input[type="password"]')) {
          try {
            const response = await fetch('/api/health');
            const page = await fetch('/', { method: 'HEAD' });
            resolve({ title: document.title, path: location.pathname, desktop: window.flowtaskDesktop?.isDesktop,
              nodeDisabled: typeof window.require === 'undefined', backendStatus: response.status,
              contentSecurityPolicy: page.headers.get('content-security-policy'),
              backendHealth: await response.json() });
          } catch (error) { reject(error); }
        } else if (Date.now() > deadline) resolve({ error: 'Login screen did not render within 30 seconds', path: location.pathname, body: document.body.innerText.slice(0, 2000) });
        else setTimeout(check, 200);
      };
      check();
    })`);
    const artifactDir = path.join(app.isPackaged ? process.cwd() : root, 'artifacts');
    fs.mkdirSync(artifactDir, { recursive: true });
    result.rendererErrors = rendererErrors;
    result.securityWarnings = securityWarnings;
    result.packaged = app.isPackaged;
    result.electronVersion = process.versions.electron;
    Object.assign(result, await require('./verify-window.cjs')(mainWindow));
    fs.writeFileSync(path.join(artifactDir, 'smoke-test.json'), JSON.stringify(result, null, 2));
    // Let the login entrance animation finish before saving visual evidence.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    fs.writeFileSync(path.join(artifactDir, 'desktop-smoke.png'), (await contents.capturePage()).toPNG());
    console.log('FlowTask desktop smoke test:', JSON.stringify(result));
    if (!result.desktop || !result.nodeDisabled || result.backendStatus !== 200 || !result.contentSecurityPolicy || result.contentSecurityPolicy.includes("'unsafe-eval'") || result.securityWarnings.length) throw new Error('Desktop smoke test failed. See artifacts/smoke-test.json.');
    app.quit();
  }
}

if (!hasLock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
  });
  app.whenReady().then(async () => {
    installDesktopNotifications(() => mainWindow, () => rendererOrigin);
    installDesktopTracking(() => mainWindow, () => rendererOrigin, () => rendererOrigin);
    if (!app.isPackaged && process.env.FLOWTASK_DEV_URL) {
      const url = new URL(process.env.FLOWTASK_DEV_URL);
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Development URL must be local.');
      rendererOrigin = url.origin;
    } else {
      localServer = await startDesktopServer({ dist: path.join(root, 'dist'), backendURL: readBackendURL(root), port: smokeTest ? 0 : 47831 });
      rendererOrigin = localServer.origin;
    }
    Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
      { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'reload' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : [])] },
    ]) : null);
    await createWindow();
  }).catch((error) => {
    console.error(error);
    if (!smokeTest) dialog.showErrorBox('FlowTask could not start', `${error.message}\n\nCheck desktopApp/.env and make sure port 47831 is available.`);
    app.exit(1);
  });
  app.on('activate', () => { if (!mainWindow && rendererOrigin) createWindow().catch(console.error); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('will-quit', () => { localServer?.close(); });
}

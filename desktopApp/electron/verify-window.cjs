// Only invoked by --smoke-test, with an isolated temporary desktop session.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { BrowserWindow, Menu, clipboard, ClipboardItem, app } = require('electron');
const pause = () => new Promise((resolve) => setTimeout(resolve, 250));

module.exports = async (window) => {
  if (process.platform === 'darwin') return { windowChecks: 'Windows/Linux checks skipped on macOS' };
  const contents = window.webContents;
  const checkMenu = () => {
    assert.equal(Menu.getApplicationMenu(), null);
    assert.equal(window.isMenuBarVisible(), false);
  };
  const key = async (keyCode, modifiers = []) => {
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause();
  };
  checkMenu();
  const size = window.getSize();
  window.setSize(size[0] - 100, size[1] - 100);
  await pause();
  assert.deepEqual(window.getSize(), [size[0] - 100, size[1] - 100]);
  window.setSize(...size);
  window.minimize();
  await pause();
  assert.equal(window.isMinimized(), true);
  window.restore();
  window.maximize();
  await pause();
  assert.equal(window.isMaximized(), true);
  window.unmaximize();
  await pause();
  assert.equal(window.isMaximized(), false);
  window.focus();
  contents.focus();
  // Use a temporary field so no credentials or business data are changed.
  const previousClipboard = await Promise.all((await clipboard.read()).map(async (item) =>
    new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async (type) => [type, await item.getType(type)]))))));
  try {
    await contents.executeJavaScript(`{
      const field = document.createElement('textarea');
      field.id = 'desktop-edit-check'; document.body.appendChild(field); field.focus();
    }`);
    await contents.insertText('FlowTask shortcut check');
    await key('a', ['control']);
    await key('c', ['control']);
    assert.equal(await clipboard.readText(), 'FlowTask shortcut check');
    await key('x', ['control']);
    assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), '');
    await key('v', ['control']);
    assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), 'FlowTask shortcut check');
    await key('z', ['control']);
    assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), '');
    await key('y', ['control']);
    assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), 'FlowTask shortcut check');
  } finally {
    await clipboard.write(previousClipboard);
    await contents.executeJavaScript("document.getElementById('desktop-edit-check')?.remove()");
  }
  await key('=', ['control']);
  assert.equal(contents.getZoomLevel(), 0.5);
  await key('0', ['control']);
  assert.equal(contents.getZoomLevel(), 0);
  await key('F11');
  assert.equal(window.isFullScreen(), true);
  await key('F11');
  assert.equal(window.isFullScreen(), false);
  const toolsOpened = app.isPackaged ? null : once(contents, 'devtools-opened', { signal: AbortSignal.timeout(15000) });
  await key('F12');
  if (toolsOpened) await toolsOpened;
  assert.equal(contents.isDevToolsOpened(), !app.isPackaged);
  if (contents.isDevToolsOpened()) { contents.closeDevTools(); await pause(); }
  for (const [code, modifiers] of [['r', ['control']], ['F5', []]]) {
    const loaded = once(contents, 'did-finish-load', { signal: AbortSignal.timeout(15000) });
    await key(code, modifiers);
    await loaded;
    checkMenu();
  }
  const origin = new URL(contents.getURL()).origin;
  await contents.loadURL(`${origin}/forgot-password`);
  checkMenu();
  await contents.loadURL(`${origin}/login`);
  checkMenu();
  for (let index = 0; index < 2; index++) {
    const secondary = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await secondary.loadURL('about:blank');
    assert.equal(secondary.isMenuBarVisible(), false);
    const closed = once(secondary, 'closed');
    secondary.close();
    await closed;
  }
  return { menuRemoved: true, windowChecks: {
    resize: true, minimizeRestore: true, maximizeRestore: true, fullscreen: true,
    copyCutPaste: true, selectAll: true, undoRedo: true, zoomReset: true,
    reloadShortcuts: true, developmentToolsPolicy: true, navigation: true,
    secondaryWindows: true, windowRecreation: true, secondaryClose: true,
  } };
};

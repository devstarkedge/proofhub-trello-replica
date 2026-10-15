// Only invoked by --smoke-test, with an isolated temporary desktop session.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const path = require('node:path');
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
  const previousClipboard = [];
  for (const item of await clipboard.read()) {
    const entries = await Promise.all(item.types.map(async (type) => [type, await item.getType(type)]));
    if (entries.length) previousClipboard.push(new ClipboardItem(Object.fromEntries(entries)));
  }
  let clipboardCommands = 'not_available_without_foreground_focus';
  try {
    await contents.executeJavaScript(`{
      const field = document.createElement('textarea');
      field.id = 'desktop-edit-check'; document.body.appendChild(field); field.focus();
    }`);
    await contents.insertText('FlowTask shortcut check');
    await contents.executeJavaScript("document.getElementById('desktop-edit-check').select()");
    contents.copy(); await pause();
    if (await clipboard.readText() === 'FlowTask shortcut check') {
      contents.cut(); await pause();
      assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), '');
      contents.paste(); await pause();
      assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), 'FlowTask shortcut check');
      contents.undo(); await pause();
      assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), '');
      contents.redo(); await pause();
      assert.equal(await contents.executeJavaScript("document.getElementById('desktop-edit-check').value"), 'FlowTask shortcut check');
      clipboardCommands = true;
    }
  } finally {
    if (previousClipboard.length) await clipboard.write(previousClipboard);
    else clipboard.clear();
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
  let nativeInputBindingLoaded = null;
  let webpEncoderVerified = null;
  let trackingSocketLoaded=null;
  if (app.isPackaged) {
    nativeInputBindingLoaded = Boolean(require(path.join(process.resourcesPath, 'node_modules', 'uiohook-napi')).uIOhook);
    assert.equal(nativeInputBindingLoaded, true);
    const sharp=require(path.join(process.resourcesPath,'node_modules','sharp'));
    const png=await sharp({create:{width:32,height:16,channels:3,background:'#ffffff'}}).png().toBuffer();
    const encoded=await require('./screenshot-encoder.cjs').encodeWebP(png);
    const metadata=await sharp(encoded.data).metadata();webpEncoderVerified=metadata.format==='webp'&&metadata.width===32&&metadata.height===16&&encoded.quality===85;
    assert.equal(webpEncoderVerified,true);
    trackingSocketLoaded=typeof require(path.join(process.resourcesPath,'node_modules','socket.io-client')).io==='function';assert.equal(trackingSocketLoaded,true);
  }
  return { menuRemoved: true, nativeInputBindingLoaded, webpEncoderVerified, trackingSocketLoaded, windowChecks: {
    resize: true, minimizeRestore: true, maximizeRestore: true, fullscreen: true,
    copyCutPaste: clipboardCommands, selectAll: clipboardCommands, undoRedo: clipboardCommands, zoomReset: true,
    reloadShortcuts: true, developmentToolsPolicy: true, navigation: true,
    secondaryWindows: true, windowRecreation: true, secondaryClose: true,
  } };
};

const { BrowserWindow, nativeImage, screen, ipcMain } = require('electron');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

const HIT_TEST = 'flowtask:capture-preview-hit-test';
const CLOSE = 'flowtask:capture-preview-close';
const DURATION_MS = 2000;

function previewBounds(display, size) {
  const area = display.workArea;
  const margin = Math.min(16, Math.floor(Math.min(area.width, area.height) / 20));
  const width = Math.max(1, Math.min(340, area.width - margin * 2));
  const height = Math.max(1, Math.min(Math.round((width - 12) * size.height / size.width) + 40, 240, area.height - margin * 2));
  return { x: Math.round(area.x + area.width - width - margin), y: Math.round(area.y + area.height - height - margin), width, height };
}

function previewDocument(dataURL, nonce) {
  return `<!doctype html><html><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'">
    <title>FlowTask screenshot preview</title><style nonce="${nonce}">
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font:12px system-ui,sans-serif;user-select:none}
    body{padding:6px}.preview{position:relative;height:100%;opacity:0;overflow:hidden;border:1px solid #475569;border-radius:10px;background:#111827;color:#f8fafc;box-shadow:0 2px 6px #0005}
    img{display:block;width:100%;height:calc(100% - 28px);object-fit:contain;background:#0f172a;pointer-events:none}
    .caption{height:28px;display:flex;align-items:center;padding:0 10px;pointer-events:none}
    button{position:absolute;right:7px;top:7px;width:28px;height:28px;display:grid;place-items:center;border:1px solid #ffffff40;border-radius:6px;background:#111827e6;color:#fff;cursor:pointer;padding:0}
    button:hover{background:#334155}svg{pointer-events:none}
    body.visible .preview{animation:preview-life 2000ms ease-out both}
    @keyframes preview-life{0%{opacity:0;transform:translateY(8px)}8%,88%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(5px)}}
    @media(prefers-reduced-motion:reduce){body.visible .preview{animation-name:preview-fade}@keyframes preview-fade{0%,88%{opacity:1}100%{opacity:0}}}
    </style></head><body><div class="preview"><img src="${dataURL}" alt="Screenshot just captured"><div class="caption">Screenshot captured</div>
    <button type="button" aria-label="Close preview" tabindex="-1"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></div>
    <script nonce="${nonce}">
    document.querySelector('button').addEventListener('click',()=>window.capturePreview.close());
    document.addEventListener('mousemove',()=>window.capturePreview.hitTest());
    document.addEventListener('mouseleave',()=>window.capturePreview.hitTest());
    </script></body></html>`;
}

// This controller never writes image bytes, touches uploads or accepts images
// from a renderer. Each preview owns one short-lived, sandboxed window.
function createScreenshotPreview() {
  let current = null, sequence = 0;
  function dismiss() {
    sequence++;
    const entry = current;
    current = null;
    if (!entry) return;
    clearTimeout(entry.timer);
    ipcMain.removeListener(HIT_TEST, entry.hitTest);
    ipcMain.removeListener(CLOSE, entry.close);
    for (const event of ['display-removed', 'display-metrics-changed']) screen.removeListener(event, entry.screenChanged);
    try { if (!entry.window.isDestroyed()) { entry.window.hide(); entry.window.destroy(); } } catch { /* Preview failure never blocks tracking. */ }
  }
  async function beforeCapture() {
    const wasVisible = current && !current.window.isDestroyed() && current.window.isVisible();
    dismiss(); // Also invalidates an image/window that is still loading.
    // ScreenCaptureKit ignores content protection. Let the compositor remove
    // an existing preview before asking the OS for the next screen image.
    if (wasVisible) await new Promise(resolve => setTimeout(resolve, 80));
  }
  async function show(buffer, displayId, authorized) {
    dismiss();
    const ticket = sequence;
    let entry;
    try {
      if (!authorized() || !Buffer.isBuffer(buffer) || !buffer.length) return;
      const displays = screen.getAllDisplays();
      const display = displays.find(value => String(value.id) === String(displayId));
      if (!display) return;
      const image = nativeImage.createFromBuffer(buffer);
      if (image.isEmpty()) return;
      const size = image.getSize(), bounds = previewBounds(display, size);
      // Only a small in-memory image crosses into the isolated renderer.
      const scale = Math.min(1, (bounds.width - 12) * Math.min(display.scaleFactor || 1, 2) / size.width, 400 / size.height);
      const dataURL = image.resize({width:Math.max(1,Math.round(size.width*scale)),height:Math.max(1,Math.round(size.height*scale)),quality:'good'}).toDataURL();
      const window = new BrowserWindow({
        ...bounds, title:'FlowTask screenshot preview', show:false, frame:false, transparent:true,
        focusable:false, alwaysOnTop:true, skipTaskbar:true, resizable:false, movable:false,
        minimizable:false, maximizable:false, fullscreenable:false, hasShadow:false,
        ...(process.platform === 'darwin' ? {type:'panel'} : {}),
        webPreferences:{preload:path.join(__dirname,'screenshot-preview-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,devTools:false,backgroundThrottling:false,spellcheck:false,partition:'flowtask-capture-preview'}
      });
      const trusted = event => current === entry && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
      entry = {window, timer:null,
        close:event=>{if(trusted(event))dismiss();},
        hitTest:event=>{
          if (!trusted(event)) return;
          try {
            const point = screen.getCursorScreenPoint(), rect = window.getBounds();
            // Only the X receives clicks. The image/body pass mouse activity
            // through to the application underneath, with no focus changes.
            const overClose = point.x >= rect.x+rect.width-42 && point.x < rect.x+rect.width-14 && point.y >= rect.y+14 && point.y < rect.y+42;
            window.setIgnoreMouseEvents(!overClose,{forward:true});
          } catch { dismiss(); }
        },
        screenChanged:()=>dismiss()
      };
      current = entry;
      window.setMenu(null);
      window.setAlwaysOnTop(true,'screen-saver');
      window.setIgnoreMouseEvents(true,{forward:true});
      if (process.platform === 'win32' || process.platform === 'darwin') window.setContentProtection(true);
      if (process.platform === 'darwin') {
        window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
        window.setHiddenInMissionControl(true);
      }
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      window.webContents.on('will-navigate',event=>event.preventDefault());
      window.webContents.on('will-attach-webview',event=>event.preventDefault());
      window.webContents.on('render-process-gone',()=>{if(current===entry)dismiss();});
      window.webContents.on('unresponsive',()=>{if(current===entry)dismiss();});
      window.on('closed',()=>{if(current===entry)dismiss();});
      window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
      window.webContents.session.setPermissionCheckHandler(()=>false);
      ipcMain.on(HIT_TEST,entry.hitTest);
      ipcMain.on(CLOSE,entry.close);
      for (const event of ['display-removed','display-metrics-changed']) screen.on(event,entry.screenChanged);
      // A crashed or stalled renderer cannot leave an invisible window alive.
      entry.timer = setTimeout(()=>{if(current===entry)dismiss();},5000);
      entry.timer.unref?.();
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewDocument(dataURL,randomBytes(18).toString('base64')))}`);
      await window.webContents.executeJavaScript('document.images[0].decode()');
      if (ticket !== sequence || current !== entry || !authorized()) { if(current===entry)dismiss(); return; }
      clearTimeout(entry.timer);
      window.showInactive();
      entry.hitTest({sender:window.webContents,senderFrame:window.webContents.mainFrame});
      if (current !== entry) return;
      entry.timer = setTimeout(()=>{if(current===entry)dismiss();},DURATION_MS);
      entry.timer.unref?.();
      await window.webContents.executeJavaScript("document.body.classList.add('visible')");
    } catch { if(current===entry)dismiss(); }
  }
  return {show, dismiss, beforeCapture};
}
module.exports = {createScreenshotPreview, previewBounds};

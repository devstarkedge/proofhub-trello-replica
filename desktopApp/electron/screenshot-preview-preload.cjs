const {contextBridge,ipcRenderer} = require('electron');
// Fixed, argument-free operations scoped to the preview's own main frame.
contextBridge.exposeInMainWorld('capturePreview',Object.freeze({
  hitTest:()=>ipcRenderer.send('flowtask:capture-preview-hit-test'),
  close:()=>ipcRenderer.send('flowtask:capture-preview-close')
}));

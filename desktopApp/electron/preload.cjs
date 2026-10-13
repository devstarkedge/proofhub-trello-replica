const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('flowtaskDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
}));

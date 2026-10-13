import { ensureElectron } from './electron-runtime.mjs';

try {
  console.log('Electron ready:', await ensureElectron());
} catch (error) {
  console.error(error.message);
  console.error('Check your internet/proxy settings. If GitHub release downloads are blocked, set ELECTRON_MIRROR to your trusted Electron mirror and run npm run electron:repair again.');
  process.exitCode = 1;
}

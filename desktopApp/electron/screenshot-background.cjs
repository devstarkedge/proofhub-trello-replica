const { Worker } = require('node:worker_threads');
const path = require('node:path');
let serial = Promise.resolve();

// One short-lived worker at a time. No native encoder or large image transforms
// run on Electron's main thread, and idle workers do not keep shutdown alive.
function encodeInBackground(bytes, { maxBytes } = {}) {
  const task = serial.then(() => new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'screenshot-encoder-worker.cjs'), { workerData: { resourcesPath: process.resourcesPath } });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve({ ...result, data: Buffer.from(result.data) });
    };
    const timer = setTimeout(() => finish(new Error('Screenshot encoding timed out; saved capture retained')), 120000);
    worker.once('message', ({ error, result }) => finish(error ? Object.assign(new Error(error.message), error) : null, result));
    worker.once('error', error => finish(error));
    worker.once('exit', code => finish(new Error(`Screenshot encoder exited (${code}); saved capture retained`)));
    worker.postMessage({ bytes, maxBytes });
  }));
  serial = task.catch(() => {});
  return task;
}
module.exports = { encodeInBackground };

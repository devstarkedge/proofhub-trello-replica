const { parentPort, workerData } = require('node:worker_threads');
// Packaged native dependencies live outside app.asar.
if (workerData?.resourcesPath) process.resourcesPath = workerData.resourcesPath;
const { encodeWebP } = require('./screenshot-encoder.cjs');
parentPort.on('message', async ({ bytes, maxBytes }) => {
  try {
    const result = await encodeWebP(Buffer.from(bytes), { maxBytes });
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: { message: error.message, code: error.code, measurement: error.measurement } });
  }
});

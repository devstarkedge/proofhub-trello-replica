export function readSpreadsheet(data, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Import cancelled', 'AbortError')); return; }
    const worker = new Worker(new URL('./spreadsheetWorker.mjs', import.meta.url), { type: 'module' });
    const finish = (error, result) => {
      clearTimeout(timeout); worker.terminate(); signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(result);
    };
    const cancel = () => finish(new DOMException('Import cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('Spreadsheet processing took too long. Split the file and retry.')), 15000);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = event => finish(event.data.error ? new Error(event.data.error) : null, event.data.workbook);
    worker.onerror = () => finish(new Error('Spreadsheet processing failed. Try a smaller file.'));
    const input = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    worker.postMessage(input, [input]);
  });
}

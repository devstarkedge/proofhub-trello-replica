import { ErrorResponse } from '../middleware/errorHandler.js';
export async function boundedResponseBuffer(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new ErrorResponse('File exceeds the upload limit', 413); }
  if (!response.body) throw new ErrorResponse('Downloaded file is empty', 400);
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > limit) throw new ErrorResponse('File exceeds the upload limit', 413);
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, bytes);
}

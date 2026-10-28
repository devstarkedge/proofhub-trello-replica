// Cloudinary upload requests can reject with { error: Error } while its
// Admin API usually rejects with the error itself. Never dump request objects:
// they may contain credentials or signed URLs.
export function migrationErrorDetails(error) {
  const chain = [], seen = new Set();
  let current = error;
  while (current != null && chain.length < 8 && !seen.has(current)) {
    chain.push(current); seen.add(current);
    current = typeof current === 'object' ? current.error ?? current.cause : null;
  }
  const innerFirst = [...chain].reverse();
  const first = field => innerFirst.map(value => value?.[field]).find(value => typeof value === 'string' || typeof value === 'number');
  const httpStatus = innerFirst.map(value => Number(value?.http_code ?? value?.statusCode)).find(value => Number.isInteger(value) && value >= 100 && value <= 599);
  let message = innerFirst.map(value => typeof value === 'string' ? value : value?.message).find(value => typeof value === 'string' && value.trim());
  const code = first('code');
  message ||= code ? `Request failed (${code})` : httpStatus ? `Provider request failed (HTTP ${httpStatus})` : 'Operation failed without a message or error code';
  message = message.replace(/[a-z][a-z\d+.-]*:\/\/[^\s"'<>]+/gi, '[redacted URL]')
    .replace(/\b(api_key|api_secret|authorization|signature|token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]');
  for (const key of ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_URL', 'MONGO_URI']) {
    const secret = process.env[key];
    if (secret?.length >= 4) message = message.split(secret).join('[redacted]');
  }
  return { name: first('name'), code, httpStatus, operation: first('operation'), message: message.slice(0, 2000) };
}

export async function cloudinaryMigrationRequest(operation, request) {
  try { return await request(); }
  catch (cause) {
    const details = migrationErrorDetails(cause);
    const error = new Error(details.message, { cause });
    Object.assign(error, { code: details.code, http_code: details.httpStatus, operation });
    throw error;
  }
}

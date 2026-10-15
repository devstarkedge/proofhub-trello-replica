// Used by both the packaged HTTP server and Vite development/preview.
// Inline scripts support the existing early theme loader and Vite React
// Refresh preamble. String evaluation remains prohibited in every mode.
const contentSecurityPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; font-src 'self' data: https:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://127.0.0.1:* wss:; frame-src 'self' blob: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

module.exports = { contentSecurityPolicy };

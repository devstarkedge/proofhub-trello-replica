const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { validateBackendURL } = require('./config.cjs');

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.pdf': 'application/pdf',
};
const isBackendPath = (url) => /^\/(api(?:\/|\?|$)|uploads(?:\/|\?|$)|socket\.io(?:\/|\?|$))/.test(url);

// This server is part of the desktop client. It never starts or modifies the backend.
async function startDesktopServer({ dist, backendURL, port = 47831 }) {
  const backend = new URL(validateBackendURL(backendURL));
  const transport = backend.protocol === 'https:' ? https : http;
  let origin;
  const sockets = new Set();
  function trusted(req) {
    return req.headers.host === new URL(origin).host &&
      (!req.headers.origin || req.headers.origin === origin) &&
      req.headers['sec-fetch-site'] !== 'cross-site';
  }
  function proxyRequest(req) {
    const headers = { ...req.headers, host: backend.host };
    // Server-to-server requests do not carry browser CORS origins. Tokens and
    // x-workspace-id are forwarded unchanged and still authorized by FlowTask.
    delete headers.origin;
    delete headers.referer;
    return transport.request(new URL(req.url, backend), { method: req.method, headers });
  }
  const server = http.createServer(async (req, res) => {
    if (!trusted(req)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (isBackendPath(req.url)) {
      const upstream = proxyRequest(req);
      upstream.on('response', (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'FlowTask backend is unavailable. Check the configured backend server. For a packaged app, verify VITE_BACKEND_PRODUCTION and rebuild.' }));
      });
      upstream.setTimeout(120000, () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      const root = path.resolve(dist);
      let filename = path.resolve(root, `.${pathname}`);
      if (filename !== root && !filename.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      let stat = await fs.promises.stat(filename).catch(() => null);
      if (!stat?.isFile()) {
        // BrowserRouter paths must work on refresh, while missing assets must 404.
        if (path.extname(pathname) || pathname.startsWith('/assets/')) {
          res.writeHead(404).end();
          return;
        }
        filename = path.join(root, 'index.html');
        stat = await fs.promises.stat(filename);
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; font-src 'self' data: https:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://127.0.0.1:* wss:; frame-src 'self' blob: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(filename).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', (req, socket, head) => {
    if (!trusted(req) || !req.url.startsWith('/socket.io/')) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = proxyRequest(req);
    upstream.on('upgrade', (response, remote, remoteHead) => {
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('')}\r\n`);
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.on('error', () => socket.destroy());
      socket.on('error', () => remote.destroy());
      socket.on('close', () => remote.destroy());
      remote.on('close', () => socket.destroy());
      socket.pipe(remote).pipe(socket);
    });
    upstream.on('response', () => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
    upstream.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => {
    for (const socket of sockets) socket.destroy();
    return new Promise((resolve) => server.close(resolve));
  } };
}

module.exports = { startDesktopServer };

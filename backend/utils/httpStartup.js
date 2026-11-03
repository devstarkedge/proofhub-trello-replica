// Reserve the listening port before touching databases, seeds, or workers.
// A rejected listen must reach the startup catch instead of becoming an
// unhandled Server 'error' event.
export async function initializeHttpServer(server, port, initialize) {
  await new Promise((resolve, reject) => {
    const onError = error => { cleanup(); reject(error); };
    const onListening = () => { cleanup(); resolve(); };
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try { server.listen(port); } catch (error) { onError(error); }
  });
  await initialize();
}

// Also works with Engine.IO's raw HTTP response, before Express runs.
export function requireBackendReady(isReady) {
  return (_req, res, next) => {
    if (isReady()) return next();
    res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '1', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: 'starting', message: 'FlowTask backend is starting; retry shortly.' }));
  };
}

import { createServer } from 'vite';

export async function startDesktopDevServer({ root, port = 5175 }) {
  const server = await createServer({
    root,
    server: { host: '127.0.0.1', port, strictPort: false },
  });
  try {
    await server.listen();
    return server;
  } catch (error) {
    await server.close();
    throw error;
  }
}

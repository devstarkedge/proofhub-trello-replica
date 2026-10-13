import { defineConfig, loadEnv } from 'vite'
import process from 'node:process'
import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
const desktopConfig = createRequire(import.meta.url)('./electron/config.cjs')

// https://vite.dev/config/
export default ({ mode, command }) => {
  // load env file based on `mode` (development, production, etc.)
  // the third parameter '' ensures we get raw keys (not only VITE_ prefix)
  const env = loadEnv(mode, process.cwd(), '')
  const backend = desktopConfig.selectBackendURL(env, command === 'build')
  const proxyOptions = {
    target: backend,
    changeOrigin: true,
    ws: true,
    configure(proxy) {
      const removeBrowserOrigin = (request) => {
        request.removeHeader('origin')
        request.removeHeader('referer')
      }
      proxy.on('proxyReq', removeBrowserOrigin)
      proxy.on('proxyReqWs', removeBrowserOrigin)
    },
  }

  return defineConfig({
    // Explicit root-relative base ensures asset URLs are always /assets/...
    // regardless of which platform hosts the build. Without this, some
    // environments resolve to a relative path that breaks when index.html is
    // served from a non-root URL (e.g., a sub-directory or CDN prefix).
    base: '/',
    // Requests use the local desktop origin; its proxy forwards them to the
    // configured backend without requiring backend CORS or route changes.
    define: { 'import.meta.env.VITE_BACKEND_URL': 'globalThis.location.origin' },
    plugins: [react(), tailwindcss(), {
      name: 'flowtask-desktop-config',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'desktop-config.json', source: JSON.stringify({ backendURL: backend }) })
      },
    }],
    server: {
      host: '127.0.0.1',
      port: 5175,
      strictPort: true,
      cors: false,
      proxy: {
        '/api': { ...proxyOptions },
        '/uploads': { ...proxyOptions },
        '/socket.io': { ...proxyOptions },
      },
    },
    build: {
      // Enable minification
      minify: 'terser',
      terserOptions: {
        // Bound memory use on large workspaces and Windows development machines.
        maxWorkers: 1,
        compress: {
          drop_console: true,
          drop_debugger: true,
        },
      },
      // Enable source maps for production debugging
      sourcemap: false,
      // Optimize chunk splitting
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunks
            vendor: ['react', 'react-dom', 'react-router-dom'],
            ui: ['lucide-react', 'framer-motion', 'react-toastify'],
            charts: ['chart.js', 'react-chartjs-2', 'recharts'],
            calendar: ['@fullcalendar/react', '@fullcalendar/daygrid', '@fullcalendar/interaction', 'fullcalendar'],
            query: ['@tanstack/react-query'],
            utils: ['axios', 'socket.io-client', 'idb'],
          },
        },
      },
      // Enable compression
      reportCompressedSize: true,
      // Set chunk size warnings
      chunkSizeWarningLimit: 1000,
    },
  })
}

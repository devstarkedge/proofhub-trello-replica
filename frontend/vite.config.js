import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default ({ mode }) => {
  // load env file based on `mode` (development, production, etc.)
  // the third parameter '' ensures we get raw keys (not only VITE_ prefix)
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL

  return defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
    build: {
      // Enable minification
      minify: 'terser',
      terserOptions: {
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

import { defineConfig } from 'vite';

// The front end lives in src/web and builds to dist/web, which the Node
// server serves in production. In development, Vite proxies server routes
// to the server started by `npm run dev:server`.
const serverOrigin = 'http://localhost:8787';

export default defineConfig({
  root: 'src/web',
  // Recorded sounds, the silent clip for iPhones, and the extracted Strudel worklets.
  publicDir: '../../public',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    // Strudel is one large module; splitting it gains nothing.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    proxy: {
      '/api': serverOrigin,
      '/healthz': serverOrigin,
    },
  },
});

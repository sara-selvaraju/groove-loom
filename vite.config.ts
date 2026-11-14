import { defineConfig } from 'vite';

// The front end lives in src/web and builds to dist/web, which the Node
// server serves in production. In development, Vite proxies server routes
// to the server started by `npm run dev:server`.
const serverOrigin = 'http://localhost:8787';

export default defineConfig({
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': serverOrigin,
      '/healthz': serverOrigin,
    },
  },
});

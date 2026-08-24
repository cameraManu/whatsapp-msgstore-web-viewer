import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// Server-side build: in production (Docker), the Express server (server/index.ts)
// serves both the built frontend and /api/* on one port — this config isn't
// used there. This config is only for local frontend development: run the
// Express API on API_PORT (default 3001) with `npm run server:dev`, and this
// Vite dev server proxies /api/* to it.
const API_PORT = process.env.API_PORT || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${API_PORT}`,
    },
  },
});

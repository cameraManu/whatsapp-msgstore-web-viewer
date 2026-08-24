import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { backupFolderPlugin } from './vite-backup-plugin';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Loads .env / .env.local so WA_BACKUP_DIR is available to the dev-server
  // middleware (server-side only — never sent to the browser bundle).
  // Real environment variables (e.g. set by Docker Compose) take precedence
  // over values from .env files, so WA_BACKUP_DIR=/backup set in
  // docker-compose.yml isn't overwritten by an empty value in a mounted .env.
  const fileEnv = loadEnv(mode, process.cwd(), '');
  process.env = { ...fileEnv, ...process.env };

  return {
    plugins: [react(), backupFolderPlugin()],
    base: '/whatsapp-msgstore-web-viewer/',
  };
});
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectEncryptionType, decryptDatabase, parseKeyInput } from './decrypt.js';
import { openDatabase, getConversations, getMessages, isDatabaseOpen } from './db.js';
import { findBackupFile } from './findBackup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 5173;
const BACKUP_DIR = process.env.WA_BACKUP_DIR;
const KEY_HEX = process.env.WA_BACKUP_KEY_HEX;

let loadError: string | null = null;
let loadedFileName: string | null = null;

/** Loads (decrypts if needed) the configured backup file into memory at startup. */
function loadBackupAtStartup() {
  if (!BACKUP_DIR) {
    loadError = 'WA_BACKUP_DIR is not set.';
    console.error(`[startup] ${loadError}`);
    return;
  }

  const found = findBackupFile(BACKUP_DIR);
  if (!found) {
    loadError = `No .db / .crypt12 / .crypt14 / .crypt15 file found in ${BACKUP_DIR}`;
    console.error(`[startup] ${loadError}`);
    return;
  }

  loadedFileName = found.name;
  console.log(`[startup] Found backup file: ${found.path}`);

  const fileBuffer = fs.readFileSync(found.path);
  const encType = detectEncryptionType(found.name);

  try {
    if (encType) {
      if (!KEY_HEX) {
        loadError = `${found.name} is encrypted but WA_BACKUP_KEY_HEX is not set.`;
        console.error(`[startup] ${loadError}`);
        return;
      }
      console.log(`[startup] Decrypting (${encType})...`);
      const rootKey = parseKeyInput(KEY_HEX);
      const decrypted = decryptDatabase(fileBuffer, encType, rootKey);
      console.log(`[startup] Decrypted OK (${(decrypted.length / (1024 * 1024)).toFixed(1)} MB). Opening database...`);
      openDatabase(decrypted);
    } else {
      console.log('[startup] File is not encrypted, opening directly...');
      openDatabase(fileBuffer);
    }
    console.log('[startup] Database ready.');
  } catch (err: any) {
    loadError = `Failed to decrypt/open database: ${err.message}`;
    console.error(`[startup] ${loadError}`);
  }
}

loadBackupAtStartup();

const app = express();

app.get('/api/status', (_req, res) => {
  res.json({
    ready: isDatabaseOpen(),
    fileName: loadedFileName,
    error: loadError,
  });
});

app.get('/api/conversations', (req, res) => {
  if (!isDatabaseOpen()) {
    return res.status(503).json({ error: loadError || 'Database not loaded' });
  }
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 1000;
    res.json(getConversations(limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/conversations/:id/messages', (req, res) => {
  if (!isDatabaseOpen()) {
    return res.status(503).json({ error: loadError || 'Database not loaded' });
  }
  try {
    const chatId = Number(req.params.id);
    const limit = req.query.limit ? Number(req.query.limit) : 5000;
    res.json(getMessages(chatId, limit));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the built frontend (vite build output)
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else {
  console.warn('[startup] dist/ not found — did you run `npm run build`?');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[startup] Server listening on http://0.0.0.0:${PORT}`);
});

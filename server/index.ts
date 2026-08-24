import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectEncryptionType, decryptDatabase, parseKeyInput } from './decrypt.js';
import { openDatabase, loadContacts, getConversations, getMessages, getMediaPathForMessage, isDatabaseOpen } from './db.js';
import { findBackupFile, findContactsFile } from './findBackup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 5173;
const BACKUP_DIR = process.env.WA_BACKUP_DIR;
const KEY_HEX = process.env.WA_BACKUP_KEY_HEX;

// Media resolution: if WA_MEDIA_DIR is explicitly set, use it. Otherwise,
// derive it automatically as "<WA_BACKUP_DIR>/Media" — this matches WhatsApp's
// normal export layout (WhatsApp/Backups/... + WhatsApp/Media/...) so a
// single WA_BACKUP_DIR pointing at the parent "WhatsApp" folder is enough.
let MEDIA_DIR: string | null = null;
if (process.env.WA_MEDIA_DIR) {
  MEDIA_DIR = path.resolve(process.env.WA_MEDIA_DIR);
} else if (BACKUP_DIR) {
  const candidate = path.resolve(BACKUP_DIR, 'Media');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    MEDIA_DIR = candidate;
  }
}

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

/** Best-effort: decrypts and loads wa.db (contacts) for name resolution. Never blocks startup on failure. */
function loadContactsAtStartup() {
  if (!BACKUP_DIR) return;

  const found = findContactsFile(BACKUP_DIR);
  if (!found) {
    console.log('[startup] No wa.db found — conversations will show phone numbers instead of contact names.');
    return;
  }

  try {
    const fileBuffer = fs.readFileSync(found.path);
    const encType = detectEncryptionType(found.name);
    let dbBuffer: Buffer;

    if (encType) {
      if (!KEY_HEX) {
        console.log(`[startup] ${found.name} is encrypted but WA_BACKUP_KEY_HEX is not set — skipping contact names.`);
        return;
      }
      const rootKey = parseKeyInput(KEY_HEX);
      dbBuffer = decryptDatabase(fileBuffer, encType, rootKey);
    } else {
      dbBuffer = fileBuffer;
    }

    const count = loadContacts(dbBuffer);
    console.log(`[startup] Loaded ${count} contact name(s) from ${found.name}.`);
  } catch (err: any) {
    console.log(`[startup] Could not load contacts from ${found.name}: ${err.message} — continuing without contact names.`);
  }
}

loadContactsAtStartup();

if (MEDIA_DIR) {
  console.log(`[startup] Media folder: ${MEDIA_DIR}`);
} else {
  console.log('[startup] No media folder found/configured — media will show as "Media omitted".');
}

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

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.3gp': 'video/3gpp',
  '.mov': 'video/quicktime',
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.amr': 'audio/amr',
  '.pdf': 'application/pdf',
};

// Streams the media file (image/video/audio/document) attached to a message,
// resolved from the DB's stored relative path against WA_MEDIA_DIR. Media
// files in a WhatsApp backup are NOT encrypted (only msgstore.db is), so
// these are served directly from disk.
//
// WhatsApp's message_media.file_path has been observed in a few different
// forms across versions/exports:
//   "WhatsApp Images/IMG-....jpg"                (relative to Media/)
//   "Media/WhatsApp Images/IMG-....jpg"           (relative to WhatsApp/)
//   "/storage/emulated/0/.../Media/WhatsApp Images/IMG-....jpg" (absolute device path)
// Rather than assume one, try several candidate resolutions and use whichever
// actually exists on disk.
function resolveMediaCandidates(relPath: string): string[] {
  if (!MEDIA_DIR) return [];
  const candidates: string[] = [];

  // 1. As-is, relative to MEDIA_DIR
  candidates.push(path.resolve(MEDIA_DIR, relPath));

  // 2. Strip a leading "Media/" segment (case-insensitive) if present, in
  //    case the stored path already includes it and MEDIA_DIR also points at Media/
  const normalized = relPath.replace(/\\/g, '/');
  const stripped = normalized.replace(/^media\//i, '');
  if (stripped !== normalized) {
    candidates.push(path.resolve(MEDIA_DIR, stripped));
  }

  // 3. If it's an absolute-looking device path, take everything from the
  //    last "Media/" segment onward and resolve that against MEDIA_DIR.
  const mediaIdx = normalized.toLowerCase().lastIndexOf('/media/');
  if (mediaIdx !== -1) {
    const afterMedia = normalized.slice(mediaIdx + '/media/'.length);
    candidates.push(path.resolve(MEDIA_DIR, afterMedia));
  }

  // De-duplicate while preserving order
  return [...new Set(candidates)];
}

app.get('/api/media/:messageId', (req, res) => {
  if (!isDatabaseOpen()) {
    return res.status(503).json({ error: loadError || 'Database not loaded' });
  }
  if (!MEDIA_DIR) {
    return res.status(404).json({ error: 'WA_MEDIA_DIR is not configured on the server' });
  }

  const messageId = Number(req.params.messageId);
  const relPath = getMediaPathForMessage(messageId);
  if (!relPath) {
    return res.status(404).json({ error: 'No media found for this message' });
  }

  const normalizedRoot = MEDIA_DIR.endsWith(path.sep) ? MEDIA_DIR : MEDIA_DIR + path.sep;
  const candidates = resolveMediaCandidates(relPath);

  let target: string | null = null;
  for (const candidate of candidates) {
    if (!candidate.startsWith(normalizedRoot)) continue; // reject path traversal
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      target = candidate;
      break;
    }
  }

  if (!target) {
    console.warn(
      `[media] Not found for message ${messageId}. DB path: "${relPath}". Tried:\n` +
        candidates.map((c) => `  - ${c}`).join('\n')
    );
    // Common for offloaded/deleted media — the DB still references it but the
    // file itself was removed from the device to save space.
    return res.status(404).json({ error: 'Media file not found on disk (may have been offloaded)' });
  }

  const ext = path.extname(target).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(target);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    // Supports byte-range requests, which browsers use for <video>/<audio>
    // seeking. Without this, the seekbar can't jump to arbitrary positions.
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', end - start + 1);
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(target, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(target).pipe(res);
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

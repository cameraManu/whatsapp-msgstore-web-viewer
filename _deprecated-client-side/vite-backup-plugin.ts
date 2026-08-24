import type { Plugin, Connect } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { IncomingMessage, ServerResponse } from 'node:http';

// File types we consider relevant inside a WhatsApp backup folder.
const DB_EXTENSIONS = ['.db', '.crypt12', '.crypt14', '.crypt15'];

const isDbFile = (name: string) =>
  DB_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

// Heuristic for key files: no extension, or named "key"/"*.key", and not a db file.
const isKeyFile = (name: string) => {
  const lower = name.toLowerCase();
  if (isDbFile(lower)) return false;
  return lower === 'key' || lower.endsWith('.key') || lower.includes('key');
};

interface BackupEntry {
  name: string;
  relPath: string; // relative to WA_BACKUP_DIR, POSIX-style separators
  kind: 'db' | 'key';
  size: number;
  mtimeMs: number;
}

function scanDir(rootDir: string, currentDir: string, depth: number, results: BackupEntry[]) {
  if (depth > 4) return; // avoid runaway recursion into huge folders
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      scanDir(rootDir, fullPath, depth + 1, results);
    } else if (entry.isFile()) {
      const kind = isDbFile(entry.name) ? 'db' : isKeyFile(entry.name) ? 'key' : null;
      if (!kind) continue;
      const stat = fs.statSync(fullPath);
      results.push({
        name: entry.name,
        relPath: path.relative(rootDir, fullPath).split(path.sep).join('/'),
        kind,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Vite dev-server middleware that exposes a locally-configured WhatsApp backup
 * folder (WA_BACKUP_DIR env var) to the frontend via two endpoints:
 *
 *   GET /api/backup/status         -> { configured, dir }
 *   GET /api/backup/files          -> { files: BackupEntry[] }
 *   GET /api/backup/file?path=...  -> raw file bytes (relPath must resolve inside WA_BACKUP_DIR)
 *
 * Only active in dev (`vite dev`). Does nothing for production builds.
 */
export function backupFolderPlugin(): Plugin {
  return {
    name: 'wa-backup-folder-middleware',
    configureServer(server) {
      // Read directly from process.env (populated from .env / .env.local by
      // vite.config.ts via loadEnv before this plugin runs). Not prefixed with
      // VITE_ on purpose, so it's never exposed to client-side code/bundle.
      const backupDir = process.env.WA_BACKUP_DIR;

      const resolvedDir = backupDir ? path.resolve(backupDir) : null;

      const handler: Connect.NextHandleFunction = (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url) return next();
        const url = new URL(req.url, 'http://localhost');

        if (url.pathname === '/api/backup/status') {
          const exists = resolvedDir ? fs.existsSync(resolvedDir) : false;
          return sendJson(res, 200, {
            configured: !!resolvedDir,
            exists,
            dir: resolvedDir || null,
          });
        }

        if (url.pathname === '/api/backup/files') {
          if (!resolvedDir) {
            return sendJson(res, 200, { files: [], error: 'WA_BACKUP_DIR is not set in .env' });
          }
          if (!fs.existsSync(resolvedDir)) {
            return sendJson(res, 200, { files: [], error: `Folder not found: ${resolvedDir}` });
          }
          try {
            const results: BackupEntry[] = [];
            scanDir(resolvedDir, resolvedDir, 0, results);
            results.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'db' ? -1 : 1));
            return sendJson(res, 200, { files: results });
          } catch (err: any) {
            return sendJson(res, 500, { files: [], error: err.message || 'Failed to read folder' });
          }
        }

        if (url.pathname === '/api/backup/file') {
          if (!resolvedDir) {
            return sendJson(res, 400, { error: 'WA_BACKUP_DIR is not set' });
          }
          const relPath = url.searchParams.get('path');
          if (!relPath) {
            return sendJson(res, 400, { error: 'Missing "path" query parameter' });
          }

          // Resolve and ensure the final path stays inside resolvedDir (prevent path traversal).
          const target = path.resolve(resolvedDir, relPath);
          const normalizedRoot = resolvedDir.endsWith(path.sep) ? resolvedDir : resolvedDir + path.sep;
          if (!target.startsWith(normalizedRoot)) {
            return sendJson(res, 403, { error: 'Invalid path' });
          }
          if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            return sendJson(res, 404, { error: 'File not found' });
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(target)}"`);
          fs.createReadStream(target).pipe(res);
          return;
        }

        next();
      };

      server.middlewares.use(handler);
    },
  };
}

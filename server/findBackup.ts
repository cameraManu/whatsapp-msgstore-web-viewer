import fs from 'node:fs';
import path from 'node:path';

const DB_EXTENSIONS = ['.db', '.crypt12', '.crypt14', '.crypt15'];
const isDbFile = (name: string) => DB_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

export interface FoundFile {
  path: string;
  name: string;
}

const scanDir = (rootDir: string, currentDir: string, depth: number, results: FoundFile[]): void => {
  if (depth > 4) return;
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
    } else if (entry.isFile() && isDbFile(entry.name)) {
      results.push({ path: fullPath, name: entry.name });
    }
  }
};

const priority = (name: string): number => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.crypt15')) return 0;
  if (lower.endsWith('.crypt14')) return 1;
  if (lower.endsWith('.crypt12')) return 2;
  return 3; // plain .db
};

/** Strips any recognized DB extension from a lowercased filename. */
const stripExt = (lowerName: string): string =>
  DB_EXTENSIONS.reduce((n, ext) => (n.endsWith(ext) ? n.slice(0, -ext.length) : n), lowerName);

/**
 * Finds a backup file whose base filename (extension stripped) exactly
 * matches one of the given names (case-insensitive) — e.g. "msgstore.db" or
 * "wa.db" — not just files that start with that prefix. This avoids
 * accidentally picking a dated incremental backup like
 * "msgstore-2026-08-24.1.db.crypt14" over the real "msgstore.db.crypt15".
 * Prefers the most-encrypted / most recently modified match if multiple exist.
 */
const findExactBaseName = (backupDir: string, exactBaseNames: string[]): FoundFile | null => {
  if (!fs.existsSync(backupDir)) return null;

  const all: FoundFile[] = [];
  scanDir(backupDir, backupDir, 0, all);

  const wanted = exactBaseNames.map((n) => n.toLowerCase());
  const results = all.filter((f) => wanted.includes(stripExt(f.name.toLowerCase())));
  if (results.length === 0) return null;

  results.sort((a, b) => {
    const p = priority(a.name) - priority(b.name);
    if (p !== 0) return p;
    return fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs;
  });

  return results[0];
};

/** Finds the main WhatsApp message database (msgstore.db / .crypt12/14/15). */
export const findBackupFile = (backupDir: string): FoundFile | null =>
  findExactBaseName(backupDir, ['msgstore.db', 'msgstore']);

/** Finds the WhatsApp contacts database (wa.db / .crypt12/14/15), used to resolve display names. */
export const findContactsFile = (backupDir: string): FoundFile | null =>
  findExactBaseName(backupDir, ['wa.db', 'wa']);

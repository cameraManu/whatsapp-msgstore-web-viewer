import fs from 'node:fs';
import path from 'node:path';

const DB_EXTENSIONS = ['.db', '.crypt12', '.crypt14', '.crypt15'];
const isDbFile = (name: string) => DB_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

interface FoundFile {
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

/**
 * Finds the WhatsApp backup file to load. Prefers the most specific/most
 * recently modified match if multiple exist, prioritizing encrypted formats
 * over a plain .db so a stray sample msgstore.db doesn't get picked over a
 * real encrypted backup.
 */
export const findBackupFile = (backupDir: string): FoundFile | null => {
  if (!fs.existsSync(backupDir)) return null;

  const results: FoundFile[] = [];
  scanDir(backupDir, backupDir, 0, results);
  if (results.length === 0) return null;

  const priority = (name: string): number => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.crypt15')) return 0;
    if (lower.endsWith('.crypt14')) return 1;
    if (lower.endsWith('.crypt12')) return 2;
    return 3; // plain .db
  };

  results.sort((a, b) => {
    const p = priority(a.name) - priority(b.name);
    if (p !== 0) return p;
    // Newest first among same-priority matches
    return fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs;
  });

  return results[0];
};

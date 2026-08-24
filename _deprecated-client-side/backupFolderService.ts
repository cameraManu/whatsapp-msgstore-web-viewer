// Client for the local dev-server backup folder API exposed by vite-backup-plugin.ts.
// Only works when running `npm run dev` with WA_BACKUP_DIR set in .env — the
// production/GitHub Pages build has no backend and this will simply report
// "not configured".

export interface BackupFileEntry {
  name: string;
  relPath: string;
  kind: 'db' | 'key';
  size: number;
  mtimeMs: number;
}

export interface BackupStatus {
  configured: boolean;
  exists: boolean;
  dir: string | null;
}

export const getBackupStatus = async (): Promise<BackupStatus> => {
  try {
    const res = await fetch('/api/backup/status');
    if (!res.ok) return { configured: false, exists: false, dir: null };
    return await res.json();
  } catch {
    // No dev server / endpoint (e.g. production static build)
    return { configured: false, exists: false, dir: null };
  }
};

export const listBackupFiles = async (): Promise<{ files: BackupFileEntry[]; error?: string }> => {
  try {
    const res = await fetch('/api/backup/files');
    if (!res.ok) return { files: [], error: `Server returned ${res.status}` };
    return await res.json();
  } catch (err: any) {
    return { files: [], error: err.message || 'Could not reach the local backup server.' };
  }
};

/** Fetches a file from the linked backup folder and returns it as a browser File object. */
export const fetchBackupFile = async (entry: BackupFileEntry): Promise<File> => {
  const res = await fetch(`/api/backup/file?path=${encodeURIComponent(entry.relPath)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch "${entry.name}" (${res.status})`);
  }
  const blob = await res.blob();
  return new File([blob], entry.name, { lastModified: entry.mtimeMs });
};

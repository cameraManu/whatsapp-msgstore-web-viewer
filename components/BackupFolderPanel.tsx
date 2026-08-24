import React, { useEffect, useState, useCallback } from 'react';
import { FolderOpen, RefreshCw, Key, Database, AlertCircle, Loader } from 'lucide-react';
import {
  getBackupStatus,
  listBackupFiles,
  fetchBackupFile,
  BackupFileEntry,
  BackupStatus,
} from '../services/backupFolderService';

interface BackupFolderPanelProps {
  onFileSelected: (file: File) => void;
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const BackupFolderPanel: React.FC<BackupFolderPanelProps> = ({ onFileSelected }) => {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [files, setFiles] = useState<BackupFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const s = await getBackupStatus();
    setStatus(s);
    if (s.configured && s.exists) {
      const { files, error } = await listBackupFiles();
      setFiles(files);
      if (error) setError(error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOpen = async (entry: BackupFileEntry) => {
    setError(null);
    setOpening(entry.relPath);
    try {
      const file = await fetchBackupFile(entry);
      onFileSelected(file);
    } catch (err: any) {
      console.error(err);
      setError(err.message || `Could not open "${entry.name}".`);
    } finally {
      setOpening(null);
    }
  };

  // Nothing configured and nothing to show — don't clutter the UI (e.g. on the
  // deployed GitHub Pages demo, which has no backend at all).
  if (!loading && status && !status.configured) {
    return (
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg text-left text-xs text-gray-500">
        <div className="flex items-start">
          <FolderOpen size={16} className="mr-2 flex-shrink-0 mt-0.5 text-gray-400" />
          <span>
            Tip: to open backup files without uploading each time, set <code className="bg-gray-200 px-1 rounded">WA_BACKUP_DIR</code> in
            a <code className="bg-gray-200 px-1 rounded">.env</code> file at the project root and restart <code className="bg-gray-200 px-1 rounded">npm run dev</code>.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 text-left">
      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-400">or</span>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between bg-gray-50 px-3 py-2 border-b border-gray-200">
          <div className="flex items-center text-sm text-gray-600 min-w-0">
            <FolderOpen size={16} className="mr-1.5 flex-shrink-0 text-green-600" />
            <span className="truncate font-medium" title={status?.dir || ''}>
              {status?.dir ? status.dir.split(/[\\/]/).pop() : 'Backup folder'}
            </span>
          </div>
          <button
            onClick={refresh}
            title="Refresh"
            className="p-1.5 text-gray-400 hover:text-gray-700 rounded flex-shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="max-h-56 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-6 text-gray-400 text-sm">
              <Loader size={16} className="animate-spin mr-2" /> Reading folder...
            </div>
          )}

          {!loading && status && status.configured && !status.exists && (
            <div className="py-6 text-center text-red-400 text-xs px-4">
              Configured folder not found on disk:
              <br />
              <code className="text-red-500">{status.dir}</code>
            </div>
          )}

          {!loading && status?.exists && files.length === 0 && !error && (
            <div className="py-6 text-center text-gray-400 text-sm px-4">
              No .db, .crypt12/14/15, or key files found in this folder.
            </div>
          )}

          {!loading &&
            files.map((f) => (
              <button
                key={f.relPath}
                onClick={() => handleOpen(f)}
                disabled={opening !== null}
                className="w-full flex items-center px-3 py-2.5 hover:bg-green-50 border-b border-gray-50 last:border-b-0 text-left transition-colors disabled:opacity-50"
              >
                {opening === f.relPath ? (
                  <Loader size={16} className="mr-2.5 flex-shrink-0 text-green-600 animate-spin" />
                ) : f.kind === 'db' ? (
                  <Database size={16} className="mr-2.5 flex-shrink-0 text-green-600" />
                ) : (
                  <Key size={16} className="mr-2.5 flex-shrink-0 text-amber-500" />
                )}
                <span className="text-sm text-gray-700 truncate flex-1">{f.relPath}</span>
                <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{formatSize(f.size)}</span>
              </button>
            ))}
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 text-red-700 rounded-lg flex items-start text-left text-xs border border-red-200">
          <AlertCircle size={16} className="mr-2 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </div>
  );
};

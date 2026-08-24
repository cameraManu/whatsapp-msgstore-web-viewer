import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationList } from './components/ConversationList';
import { ChatWindow } from './components/ChatWindow';
import { Conversation } from './types';
import { Database, AlertCircle, Loader } from 'lucide-react';

const PAGE_SIZE = 30;

const App: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [totalConversations, setTotalConversations] = useState<number | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const loadingRef = useRef(false);

  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        setFileName(data.fileName || null);
        if (!data.ready) {
          setStatus('error');
          setStatusError(data.error || 'Database is not ready on the server.');
          return;
        }
        setStatus('ready');
      } catch {
        setStatus('error');
        setStatusError('Could not reach the server. Is it running?');
      }
    })();
  }, []);

  const loadMoreConversations = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMoreConversations(true);
    try {
      const res = await fetch(`/api/conversations?limit=${PAGE_SIZE}&offset=${conversations.length}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setConversations((prev) => [...prev, ...data.items]);
      setTotalConversations(data.total);
      setHasMoreConversations(data.hasMore);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMoreConversations(false);
      loadingRef.current = false;
    }
  }, [conversations.length]);

  useEffect(() => {
    if (status === 'ready') {
      loadMoreConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="bg-[#111b21] flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <div className="bg-[#202c33] rounded-xl shadow-2xl p-8 max-w-lg w-full text-center">
          <Loader className="animate-spin text-[#00a884] mx-auto mb-4" size={40} />
          <p className="text-[#e9edef] font-medium">Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-[#111b21] flex items-center justify-center p-4" style={{ minHeight: '100dvh' }}>
        <div className="bg-[#202c33] rounded-xl shadow-2xl p-8 max-w-lg w-full text-center">
          <div className="bg-red-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-400">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-2xl font-bold text-[#e9edef] mb-2">Backup Not Loaded</h1>
          <p className="text-[#8696a0] mb-6">
            The server couldn't load your WhatsApp backup. This is configured entirely via environment
            variables — there's nothing to upload here.
          </p>
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg p-4 text-left text-sm mb-6">
            {statusError}
          </div>
          <div className="text-left text-xs text-[#8696a0] bg-[#182229] border border-[#2a3942] rounded-lg p-4 space-y-1">
            <p className="font-medium text-[#aebac1] mb-2">Check on the server:</p>
            <p>
              <code className="bg-[#2a3942] px-1 rounded text-[#d1d7db]">WA_BACKUP_DIR</code> points to a folder
              containing your <code className="bg-[#2a3942] px-1 rounded text-[#d1d7db]">msgstore.db</code> /{' '}
              <code className="bg-[#2a3942] px-1 rounded text-[#d1d7db]">.crypt12/14/15</code> file
            </p>
            <p>
              <code className="bg-[#2a3942] px-1 rounded text-[#d1d7db]">WA_BACKUP_KEY_HEX</code> is set to your
              64-character hex recovery key (only needed for encrypted backups)
            </p>
          </div>
        </div>
      </div>
    );
  }

  const showGlobalTopBar = !selectedChat;

  return (
    <div className="flex flex-col overflow-hidden bg-[#111b21]" style={{ height: '100dvh' }}>
      <div
        className={`bg-[#202c33] px-4 py-2 items-center justify-between shadow-sm z-20 flex-shrink-0 ${
          showGlobalTopBar ? 'flex' : 'hidden md:flex'
        }`}
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)', minHeight: '49px' }}
      >
        <div className="flex items-center space-x-2 text-[#e9edef] font-medium">
          <Database size={18} className="text-[#00a884]" />
          <span>WA Viewer</span>
          {fileName && <span className="text-xs text-[#8696a0] font-normal">({fileName})</span>}
        </div>
        <span className="text-[11px] text-[#8696a0] bg-[#2a3942] px-2 py-1 rounded-full">
          {totalConversations !== null ? `${conversations.length}/${totalConversations}` : conversations.length}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 border-b border-red-500/30 text-red-300 px-4 py-2 text-sm flex items-center flex-shrink-0">
          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden relative">
        <div
          className={`${
            selectedChat ? 'hidden md:flex' : 'flex'
          } w-full md:w-auto h-full flex-shrink-0 border-r border-[#222d34]`}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedChat?._id || null}
            onSelect={setSelectedChat}
            hasMore={hasMoreConversations}
            loadingMore={loadingMoreConversations}
            onLoadMore={loadMoreConversations}
          />
        </div>
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 h-full min-w-0 relative`}>
          <ChatWindow conversation={selectedChat} onBack={() => setSelectedChat(null)} />
        </div>
      </div>
    </div>
  );
};

export default App;

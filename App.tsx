import React, { useState, useEffect } from 'react';
import { ConversationList } from './components/ConversationList';
import { ChatWindow } from './components/ChatWindow';
import { Conversation, Message } from './types';
import { Database, AlertCircle, Loader } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [statusError, setStatusError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [maxChats, setMaxChats] = useState(1000);
  const [maxMessages, setMaxMessages] = useState(5000);

  // Check server status, then load conversations once ready.
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
      } catch (err: any) {
        setStatus('error');
        setStatusError('Could not reach the server. Is it running?');
      }
    })();
  }, []);

  const loadChats = async (limit: number) => {
    try {
      const res = await fetch(`/api/conversations?limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const chats = await res.json();
      setConversations(chats);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleChatSelect = async (chat: Conversation) => {
    setSelectedChat(chat);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/conversations/${chat._id}/messages?limit=${maxMessages}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const msgs: any[] = await res.json();
      setMessages(msgs.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Load chats once the server reports ready, and whenever maxChats changes.
  useEffect(() => {
    if (status === 'ready') {
      loadChats(maxChats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, maxChats]);

  // Reload messages if the max-messages setting changes and a chat is selected.
  useEffect(() => {
    if (status === 'ready' && selectedChat) {
      handleChatSelect(selectedChat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxMessages]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full text-center">
          <Loader className="animate-spin text-green-600 mx-auto mb-4" size={40} />
          <p className="text-gray-600 font-medium">Connecting to server...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full text-center">
          <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Backup Not Loaded</h1>
          <p className="text-gray-500 mb-6">
            The server couldn't load your WhatsApp backup. This is configured entirely via environment
            variables — there's nothing to upload here.
          </p>
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-left text-sm mb-6">
            {statusError}
          </div>
          <div className="text-left text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1">
            <p className="font-medium text-gray-600 mb-2">Check on the server:</p>
            <p>
              <code className="bg-gray-200 px-1 rounded">WA_BACKUP_DIR</code> points to a folder containing your{' '}
              <code className="bg-gray-200 px-1 rounded">msgstore.db</code> /{' '}
              <code className="bg-gray-200 px-1 rounded">.crypt12/14/15</code> file
            </p>
            <p>
              <code className="bg-gray-200 px-1 rounded">WA_BACKUP_KEY_HEX</code> is set to your 64-character hex
              recovery key (only needed for encrypted backups)
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Settings Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-2 text-green-700 font-semibold">
          <Database size={18} />
          <span>WA Viewer Pro</span>
          {fileName && <span className="text-xs text-gray-400 font-normal">({fileName})</span>}
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-2">
            <label className="text-gray-500">Max Chats:</label>
            <input
              type="number"
              value={maxChats}
              onChange={(e) => setMaxChats(Number(e.target.value))}
              className="w-16 border rounded px-2 py-1 bg-gray-50 focus:ring-1 focus:ring-green-500 outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <label className="text-gray-500">Max Msgs:</label>
            <input
              type="number"
              value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              className="w-16 border rounded px-2 py-1 bg-gray-50 focus:ring-1 focus:ring-green-500 outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-b border-red-200 text-red-700 px-4 py-2 text-sm flex items-center">
          <AlertCircle size={16} className="mr-2 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full flex-shrink-0 border-r border-gray-200 bg-white`}>
          <ConversationList
            conversations={conversations}
            selectedId={selectedChat?._id || null}
            onSelect={handleChatSelect}
          />
        </div>
        <div className={`${!selectedChat ? 'hidden md:flex' : 'flex'} flex-1 h-full min-w-0 bg-[#efeae2] relative`}>
          <ChatWindow conversation={selectedChat} messages={messages} loading={loadingMessages} />
          {/* Mobile Back Button Overlay */}
          {selectedChat && (
            <button
              onClick={() => setSelectedChat(null)}
              className="md:hidden absolute top-3 left-3 z-50 bg-white/80 p-2 rounded-full shadow-md text-gray-700 backdrop-blur-sm"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

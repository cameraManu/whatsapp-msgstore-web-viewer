import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Conversation } from '../types';
import { Search, Users, X } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (conv: Conversation) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

// Deterministic color per contact, so the same JID always gets the same
// avatar color across renders — mirrors WhatsApp's per-contact accent colors.
const AVATAR_COLORS = [
  '#7f66ff', '#00a884', '#ff6b6b', '#ffa62b', '#3ba0ff',
  '#e066a6', '#5cb85c', '#d97b29', '#8d6cff', '#20c9a6',
];
const colorForId = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initialsFor = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const Avatar: React.FC<{ label: string; isGroup: boolean }> = ({ label, isGroup }) => (
  <div
    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-sm mr-3 flex-shrink-0 select-none"
    style={{ backgroundColor: colorForId(label) }}
  >
    {isGroup ? <Users size={20} /> : initialsFor(label)}
  </div>
);

const formatListTime = (ts: number): string => {
  if (!ts) return '';
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  const daysAgo = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (daysAgo < 7) return date.toLocaleDateString(undefined, { weekday: 'short' });

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const ConversationRow: React.FC<{
  conv: Conversation;
  isSelected: boolean;
  onSelect: (c: Conversation) => void;
}> = ({ conv, isSelected, onSelect }) => {
  const displayName = conv.subject || conv.jid;
  const isGroup = !!conv.subject;

  return (
    <div
      onClick={() => onSelect(conv)}
      className={`flex items-center px-3 py-[9px] cursor-pointer transition-colors border-b border-[#222d34]/60 ${
        isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
      }`}
    >
      <Avatar label={displayName} isGroup={isGroup} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <h3 className="text-[15px] font-normal text-[#e9edef] truncate">{displayName}</h3>
          <span className="text-[12px] text-[#8696a0] ml-2 whitespace-nowrap flex-shrink-0">
            {formatListTime(conv.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[13px] text-[#8696a0] truncate pr-2">
            {conv.lastMessagePreview || (isGroup ? conv.jid : 'No messages')}
          </p>
          {conv.unreadCount > 0 && (
            <span className="bg-[#00a884] text-[#111b21] text-[11px] font-semibold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 flex-shrink-0">
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  hasMore,
  loadingMore,
  onLoadMore,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Debounced server-side search — kicks in ~200ms after typing stops, so
  // fast typists don't trigger a request per keystroke.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = searchTerm.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(data.items || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm]);

  const isSearchMode = searchTerm.trim().length > 0;
  const displayedList = isSearchMode ? searchResults ?? [] : conversations;

  // Infinite scroll: observe a sentinel element at the bottom of the list and
  // request the next page when it comes into view. Only active outside search mode.
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !isSearchMode) {
        onLoadMore();
      }
    },
    [hasMore, loadingMore, isSearchMode, onLoadMore]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersect, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <div className="flex flex-col h-full bg-[#111b21] w-full md:w-[400px] lg:w-[420px]">
      {/* Search */}
      <div className="px-3 py-2 bg-[#111b21] border-b border-[#222d34] flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            placeholder="Search chats..."
            className="w-full pl-10 pr-8 py-[9px] bg-[#202c33] text-[#d1d7db] placeholder-[#8696a0] rounded-lg text-[15px] outline-none focus:bg-[#2a3942] transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0] w-4 h-4 pointer-events-none" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef] p-1"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isSearchMode && searching && displayedList.length === 0 && (
          <div className="p-8 text-center text-[#8696a0] text-sm">Searching...</div>
        )}

        {!(isSearchMode && searching) && displayedList.length === 0 && (
          <div className="p-8 text-center text-[#8696a0] text-sm">
            {isSearchMode ? `No chats found matching "${searchTerm}"` : 'No chats yet'}
          </div>
        )}

        {displayedList.map((conv) => (
          <ConversationRow key={conv._id} conv={conv} isSelected={selectedId === conv._id} onSelect={onSelect} />
        ))}

        {/* Infinite-scroll sentinel + loading indicator, only relevant outside search */}
        {!isSearchMode && hasMore && (
          <div ref={sentinelRef} className="py-4 flex justify-center">
            <div className="w-5 h-5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

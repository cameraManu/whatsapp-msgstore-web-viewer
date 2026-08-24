import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Message, Conversation } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageSearchPanel } from './MessageSearchPanel';
import { MediaGallery } from './MediaGallery';
import { MessageSquareText, Users, MoreVertical, Lock, ArrowLeft, Search, Image as ImageIcon } from 'lucide-react';

interface ChatWindowProps {
  conversation: Conversation | null;
  onBack: () => void;
}

const PAGE_SIZE = 50;

// Helper to group messages by date
const groupMessagesByDate = (messages: Message[]) => {
  const groups: { [key: string]: Message[] } = {};
  messages.forEach((msg) => {
    const dateStr = msg.timestamp.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(msg);
  });
  return groups;
};

// Same deterministic color mapping as ConversationList, so the header avatar
// matches the sidebar avatar for the same chat.
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

const mapMsg = (m: any): Message => ({ ...m, timestamp: new Date(m.timestamp) });

export const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, onBack }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const isInitialLoad = useRef(true);

  // Load the most recent page of messages whenever the selected chat changes.
  useEffect(() => {
    if (!conversation) return;
    let cancelled = false;
    isInitialLoad.current = true;
    setMessages([]);
    setHasMoreOlder(false);
    setLoadingInitial(true);

    (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversation._id}/messages?limit=${PAGE_SIZE}`);
        const data = await res.json();
        if (cancelled) return;
        setMessages((data.items || []).map(mapMsg));
        setHasMoreOlder(!!data.hasMore);
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversation?._id]);

  // Auto-scroll to bottom only on the initial load of a chat, not when older
  // messages get prepended (that would yank the view away from where the
  // user was reading).
  useEffect(() => {
    if (!loadingInitial && isInitialLoad.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      isInitialLoad.current = false;
    }
  }, [loadingInitial, messages.length]);

  /** Loads an older page of messages, preserving scroll position (no jump). */
  const loadOlderMessages = useCallback(async () => {
    if (!conversation || loadingOlderRef.current || !hasMoreOlder || messages.length === 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const container = scrollRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    try {
      const oldestSortId = messages[0].sort_id;
      const res = await fetch(
        `/api/conversations/${conversation._id}/messages?limit=${PAGE_SIZE}&before=${oldestSortId}`
      );
      const data = await res.json();
      const older = (data.items || []).map(mapMsg);
      setMessages((prev) => [...older, ...prev]);
      setHasMoreOlder(!!data.hasMore);

      // Restore scroll position so the content the user was looking at stays put.
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
        }
      });
    } finally {
      setLoadingOlder(false);
      loadingOlderRef.current = false;
    }
  }, [conversation, hasMoreOlder, messages]);

  // Infinite scroll upward: observe a sentinel above the message list.
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadOlderMessages();
      },
      { root: scrollRef.current, rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadOlderMessages]);

  /**
   * Jumps to a specific message (from search results). If it's not in the
   * currently loaded window, reloads a fresh window ending right after it
   * (using its real sort_id as the cursor — exact, no guessing) so the
   * target message lands at the bottom of the newly loaded page.
   */
  const jumpToMessage = async (messageId: number, sortId: number) => {
    setShowSearch(false);
    const alreadyLoaded = messages.some((m) => m._id === messageId);
    if (!alreadyLoaded && conversation) {
      setLoadingInitial(true);
      try {
        const res = await fetch(
          `/api/conversations/${conversation._id}/messages?limit=${PAGE_SIZE}&before=${sortId + 1}`
        );
        const data = await res.json();
        setMessages((data.items || []).map(mapMsg));
        setHasMoreOlder(!!data.hasMore);
        isInitialLoad.current = false;
      } finally {
        setLoadingInitial(false);
      }
    }
    setHighlightedId(messageId);
    setTimeout(() => {
      const el = document.getElementById(`msg-${messageId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setHighlightedId(null), 2000);
  };

  if (!conversation) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-[#222e35] h-full p-8 text-center">
        <div className="bg-[#182229] p-8 rounded-full mb-6">
          <MessageSquareText size={64} className="text-[#364147]" />
        </div>
        <h2 className="text-3xl font-light text-[#e9edef] mb-3">WhatsApp Viewer</h2>
        <p className="text-[#8696a0] max-w-md text-sm leading-relaxed">
          Select a conversation from the sidebar to view its history.
        </p>
        <div className="flex items-center gap-1.5 text-[#8696a0] text-xs mt-8">
          <Lock size={12} />
          <span>Read-only local archive viewer</span>
        </div>
      </div>
    );
  }

  const displayName = conversation.subject || conversation.jid;
  const isGroup = !!conversation.subject;
  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] relative w-full min-w-0">
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Header */}
      <div
        className="bg-[#202c33] px-2 md:px-4 py-[10px] flex items-center justify-between z-10 sticky top-0 w-full flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', minHeight: '59px' }}
      >
        <div className="flex items-center min-w-0 flex-1">
          <button
            onClick={onBack}
            className="md:hidden p-2 -ml-1 mr-1 text-[#e9edef] flex-shrink-0 active:opacity-60"
            aria-label="Back to chat list"
          >
            <ArrowLeft size={22} />
          </button>
          <button
            onClick={() => setShowGallery(true)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white mr-3 flex-shrink-0 text-sm font-medium select-none"
            style={{ backgroundColor: colorForId(displayName) }}
            aria-label="View media"
          >
            {isGroup ? <Users size={18} /> : initialsFor(displayName)}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-[#e9edef] text-[16px] truncate">{displayName}</h2>
            <p className="text-xs text-[#8696a0] truncate">{conversation.jid}</p>
          </div>
        </div>
        <div className="flex items-center space-x-4 text-[#aebac1] flex-shrink-0 pr-1">
          <button onClick={() => setShowGallery(true)} aria-label="Media gallery" className="active:opacity-60">
            <ImageIcon size={20} />
          </button>
          <button onClick={() => setShowSearch(true)} aria-label="Search messages" className="active:opacity-60">
            <Search size={20} />
          </button>
          <MoreVertical size={20} className="cursor-not-allowed opacity-50" />
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 z-0 md:px-10 lg:px-20 w-full">
        {loadingInitial ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-7 h-7 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-[#8696a0] text-sm">No messages in this chat</div>
        ) : (
          <>
            <div ref={topSentinelRef} />
            {loadingOlder && (
              <div className="flex justify-center py-2">
                <div className="w-5 h-5 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {Object.entries(messageGroups).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex justify-center mb-4 sticky top-2 z-10">
                  <span className="bg-[#182229] shadow-sm px-3 py-1.5 rounded-lg text-[12.5px] text-[#8696a0] font-medium">
                    {date}
                  </span>
                </div>
                {msgs.map((msg) => (
                  <div key={msg._id} id={`msg-${msg._id}`} className={highlightedId === msg._id ? 'animate-pulse' : ''}>
                    <MessageBubble message={msg} />
                  </div>
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Read-only footer */}
      <div
        className="bg-[#202c33] px-4 py-[10px] z-10 flex items-center gap-3 w-full flex-shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      >
        <Lock size={14} className="text-[#8696a0] flex-shrink-0" />
        <div className="flex-1 text-[13px] text-[#8696a0] italic truncate">
          You're viewing a read-only archive — messages can't be sent from here
        </div>
      </div>

      {showSearch && (
        <MessageSearchPanel
          chatId={conversation._id}
          chatName={displayName}
          onClose={() => setShowSearch(false)}
          onJumpToMessage={jumpToMessage}
        />
      )}

      {showGallery && (
        <MediaGallery chatId={conversation._id} chatName={displayName} onClose={() => setShowGallery(false)} />
      )}
    </div>
  );
};

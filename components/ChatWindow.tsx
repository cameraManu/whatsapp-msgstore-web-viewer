import React, { useEffect, useRef } from 'react';
import { Message, Conversation } from '../types';
import { MessageBubble } from './MessageBubble';
import { MessageSquareText, Users, MoreVertical, Lock, ArrowLeft } from 'lucide-react';

interface ChatWindowProps {
  messages: Message[];
  conversation: Conversation | null;
  loading: boolean;
  onBack: () => void;
}

// Helper to group messages by date
const groupMessagesByDate = (messages: Message[]) => {
  const groups: { [key: string]: Message[] } = {};

  messages.forEach((msg) => {
    const dateStr = msg.timestamp.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
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

export const ChatWindow: React.FC<ChatWindowProps> = ({ messages, conversation, loading, onBack }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

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
      {/* Background Pattern (subtle, matches WhatsApp Web's dark chat wallpaper) */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: `url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Header — includes an inline back button on mobile (hidden on desktop, where the list stays visible) */}
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
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white mr-3 flex-shrink-0 text-sm font-medium select-none"
            style={{ backgroundColor: colorForId(displayName) }}
          >
            {isGroup ? <Users size={18} /> : initialsFor(displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-[#e9edef] text-[16px] truncate">{displayName}</h2>
            <p className="text-xs text-[#8696a0] truncate">{conversation.jid}</p>
          </div>
        </div>
        <div className="flex items-center space-x-5 text-[#aebac1] flex-shrink-0 pr-1">
          <MoreVertical size={20} className="cursor-not-allowed opacity-50" />
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 z-0 md:px-10 lg:px-20 w-full">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-7 h-7 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-[#8696a0] text-sm">No messages in this chat</div>
        ) : (
          <>
            {Object.entries(messageGroups).map(([date, msgs]) => (
              <div key={date}>
                <div className="flex justify-center mb-4 sticky top-2 z-10">
                  <span className="bg-[#182229] shadow-sm px-3 py-1.5 rounded-lg text-[12.5px] text-[#8696a0] font-medium">
                    {date}
                  </span>
                </div>
                {msgs.map((msg) => (
                  <MessageBubble key={msg._id} message={msg} />
                ))}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Read-only footer, mirrors the composer bar's position without implying interactivity */}
      <div
        className="bg-[#202c33] px-4 py-[10px] z-10 flex items-center gap-3 w-full flex-shrink-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}
      >
        <Lock size={14} className="text-[#8696a0] flex-shrink-0" />
        <div className="flex-1 text-[13px] text-[#8696a0] italic truncate">
          You're viewing a read-only archive — messages can't be sent from here
        </div>
      </div>
    </div>
  );
};

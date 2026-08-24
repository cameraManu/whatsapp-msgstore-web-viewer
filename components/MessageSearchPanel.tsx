import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Calendar, User } from 'lucide-react';
import { Message } from '../types';

interface MessageSearchPanelProps {
  chatId: number;
  chatName: string;
  onClose: () => void;
  onJumpToMessage: (messageId: number, sortId: number) => void;
}

const highlightMatch = (text: string, query: string): React.ReactNode => {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#00a884]/40 text-inherit rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
};

const formatResultDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const formatResultTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const MessageSearchPanel: React.FC<MessageSearchPanelProps> = ({
  chatId,
  chatName,
  onClose,
  onJumpToMessage,
}) => {
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async () => {
    const hasQuery = query.trim().length > 0;
    const hasDateFilter = fromDate || toDate;
    if (!hasQuery && !hasDateFilter) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (hasQuery) params.set('q', query.trim());
      if (fromDate) params.set('from', String(new Date(fromDate + 'T00:00:00').getTime()));
      if (toDate) params.set('to', String(new Date(toDate + 'T23:59:59').getTime()));

      const res = await fetch(`/api/conversations/${chatId}/messages/search?${params.toString()}`);
      const data = await res.json();
      setResults(
        (data.items || []).map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
      );
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce text search; date changes trigger immediately via the effect below.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSearch, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const clearDates = () => {
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="fixed inset-0 bg-[#111b21] z-50 flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div
        className="bg-[#202c33] px-2 py-[10px] flex items-center gap-2 flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', minHeight: '59px' }}
      >
        <button onClick={onClose} className="p-2 text-[#e9edef]" aria-label="Close search">
          <X size={22} />
        </button>
        <div className="relative flex-1">
          <input
            autoFocus
            type="text"
            placeholder={`Search in ${chatName}`}
            className="w-full pl-9 pr-3 py-2 bg-[#2a3942] text-[#d1d7db] placeholder-[#8696a0] rounded-lg text-sm outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] w-4 h-4 pointer-events-none" />
        </div>
        <button
          onClick={() => setShowDateFilter((v) => !v)}
          className={`p-2 rounded-full flex-shrink-0 ${
            fromDate || toDate ? 'text-[#00a884]' : 'text-[#8696a0]'
          }`}
          aria-label="Filter by date"
        >
          <Calendar size={20} />
        </button>
      </div>

      {/* Date filter panel */}
      {showDateFilter && (
        <div className="bg-[#182229] px-4 py-3 flex flex-wrap items-center gap-3 flex-shrink-0 border-b border-[#222d34]">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#8696a0]">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-[#2a3942] text-[#d1d7db] text-sm rounded px-2 py-1 outline-none [color-scheme:dark]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#8696a0]">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-[#2a3942] text-[#d1d7db] text-sm rounded px-2 py-1 outline-none [color-scheme:dark]"
            />
          </div>
          {(fromDate || toDate) && (
            <button onClick={clearDates} className="text-xs text-[#00a884] hover:underline">
              Clear dates
            </button>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-[#8696a0] text-sm gap-2">
            <Search size={32} className="text-[#364147]" />
            No messages found
          </div>
        )}

        {!loading &&
          results.map((msg) => (
            <button
              key={msg._id}
              onClick={() => onJumpToMessage(msg._id, msg.sort_id)}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#202c33] border-b border-[#222d34]/60 text-left"
            >
              <div className="w-8 h-8 rounded-full bg-[#2a3942] flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={14} className="text-[#8696a0]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] text-[#8696a0]">{msg.from_me ? 'You' : chatName}</span>
                  <span className="text-[11px] text-[#8696a0] flex-shrink-0">
                    {formatResultDate(msg.timestamp)} · {formatResultTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-[14px] text-[#e9edef] truncate mt-0.5">
                  {msg.text_data ? highlightMatch(msg.text_data, query) : msg.has_media ? '📷 Media' : ''}
                </p>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
};

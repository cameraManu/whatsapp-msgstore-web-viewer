import React, { useState } from 'react';
import { Message } from '../types';
import { Check, Image as ImageIcon, FileText, AlertTriangle } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

const isImage = (mime: string | null, path: string | null) =>
  (mime && mime.startsWith('image/')) || (path && /\.(jpe?g|png|gif|webp)$/i.test(path));
const isVideo = (mime: string | null, path: string | null) =>
  (mime && mime.startsWith('video/')) || (path && /\.(mp4|3gp|mov)$/i.test(path));
const isAudio = (mime: string | null, path: string | null) =>
  (mime && mime.startsWith('audio/')) || (path && /\.(opus|ogg|m4a|mp3|amr)$/i.test(path));

const MediaContent: React.FC<{ message: Message }> = ({ message }) => {
  const [failed, setFailed] = useState(false);
  const src = `/api/media/${message._id}`;

  if (failed) {
    return (
      <div className="flex items-center text-gray-400 italic py-1 text-xs">
        <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
        <span>Media unavailable (may have been offloaded)</span>
      </div>
    );
  }

  if (isImage(message.media_mime, message.media_path)) {
    return (
      <img
        src={src}
        alt={message.media_caption || 'Image'}
        className="rounded-md max-w-full max-h-80 object-contain mb-1"
        onError={() => setFailed(true)}
      />
    );
  }

  if (isVideo(message.media_mime, message.media_path)) {
    return (
      <video
        src={src}
        controls
        className="rounded-md max-w-full max-h-80 mb-1"
        onError={() => setFailed(true)}
      />
    );
  }

  if (isAudio(message.media_mime, message.media_path)) {
    return <audio src={src} controls className="w-full mb-1" onError={() => setFailed(true)} />;
  }

  // Generic document / unknown type — offer it as a download link.
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center text-gray-700 hover:underline py-1"
    >
      <FileText size={16} className="mr-2 flex-shrink-0" />
      <span className="truncate">{message.media_path?.split('/').pop() || 'Document'}</span>
    </a>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isSent = message.from_me;
  const hasRealMedia = !!message.media_path;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex flex-col ${isSent ? 'items-end' : 'items-start'} mb-2 group w-full`}>
      <div
        className={`relative max-w-[85%] md:max-w-[70%] px-2 pt-2 pb-1 rounded-lg shadow-sm text-sm ${
          isSent ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'
        }`}
      >
        {/* Tail SVG */}
        {isSent ? (
          <span className="absolute -right-[8px] top-0 text-[#d9fdd3]">
             <svg viewBox="0 0 8 13" height="13" width="8" className="fill-current block"><path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path></svg>
          </span>
        ) : (
          <span className="absolute -left-[8px] top-0 text-white">
             <svg viewBox="0 0 8 13" height="13" width="8" className="fill-current block"><path d="M1.533 3.568L8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"></path></svg>
          </span>
        )}

        {/* Quoted Message */}
        {message.quoted_text && (
          <div className={`mb-1 p-2 rounded bg-opacity-30 text-xs border-l-4 w-full overflow-hidden ${
              isSent ? 'bg-green-800 border-green-600 text-green-900' : 'bg-gray-200 border-gray-400 text-gray-700'
          }`}>
             <span className="font-bold block mb-0.5 opacity-80">Quoted</span>
             <div className="whitespace-pre-wrap break-words line-clamp-4 min-w-0 w-full" style={{ wordBreak: 'break-word' }}>
               {message.quoted_text}
             </div>
          </div>
        )}

        {/* Media */}
        {hasRealMedia && <MediaContent message={message} />}

        {/* Content */}
        <div className="text-gray-900 px-1 leading-relaxed whitespace-pre-wrap break-words min-w-0 w-full" style={{ wordBreak: 'break-word' }}>
          {message.text_data ? (
            message.text_data
          ) : message.media_caption ? (
            message.media_caption
          ) : hasRealMedia ? null : (
            <div className="flex items-center text-gray-500 italic py-1">
              <ImageIcon size={16} className="mr-2" />
              <span>Media omitted</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-end mt-1 space-x-1 select-none">
          <time className="text-[10px] text-gray-500 min-w-[45px] text-right">
            {formatTime(message.timestamp)}
          </time>
          {isSent && (
            <span className="text-blue-500">
              <Check size={12} strokeWidth={3} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

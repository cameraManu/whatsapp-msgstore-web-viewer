import React, { useState } from 'react';
import { Message } from '../types';
import { Check, Image as ImageIcon, FileText, AlertTriangle, X } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

const isImage = (mime: string | null, path: string | null) =>
  (mime && mime.startsWith('image/')) || (path && /\.(jpe?g|png|gif|webp)$/i.test(path));
const isVideo = (mime: string | null, path: string | null) =>
  (mime && mime.startsWith('video/')) || (path && /\.(mp4|3gp|mov)$/i.test(path));
const isAudio = (mime: string | null, path: string | null) =>
  (mime && mime.startsWith('audio/')) || (path && /\.(opus|ogg|m4a|mp3|amr)$/i.test(path));

/** Fullscreen lightbox for viewing an image at full size. */
const ImageLightbox: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => (
  <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={onClose}>
    <button
      onClick={onClose}
      className="absolute top-4 right-4 text-white/80 hover:text-white p-2"
      aria-label="Close"
    >
      <X size={28} />
    </button>
    <img src={src} alt={alt} className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
  </div>
);

const MediaContent: React.FC<{ message: Message }> = ({ message }) => {
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const src = `/api/media/${message._id}`;

  if (failed) {
    return (
      <div className="flex items-center text-[#8696a0] italic py-1 text-xs">
        <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
        <span>Media unavailable (may have been offloaded)</span>
      </div>
    );
  }

  if (isImage(message.media_mime, message.media_path)) {
    return (
      <>
        <img
          src={src}
          alt={message.media_caption || 'Image'}
          className="rounded-md max-w-full max-h-80 object-contain mb-1 cursor-pointer hover:opacity-90 transition-opacity"
          onError={() => setFailed(true)}
          onClick={() => setLightboxOpen(true)}
        />
        {lightboxOpen && (
          <ImageLightbox src={src} alt={message.media_caption || 'Image'} onClose={() => setLightboxOpen(false)} />
        )}
      </>
    );
  }

  if (isVideo(message.media_mime, message.media_path)) {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        className="rounded-md max-w-full max-h-80 mb-1"
        onError={() => setFailed(true)}
      />
    );
  }

  if (isAudio(message.media_mime, message.media_path)) {
    return <audio src={src} controls preload="metadata" className="w-full mb-1" onError={() => setFailed(true)} />;
  }

  // Generic document / unknown type — offer it as a download link.
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center text-[#d1d7db] hover:underline py-1.5 px-1 bg-black/10 rounded"
    >
      <FileText size={16} className="mr-2 flex-shrink-0 text-[#8696a0]" />
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
    <div className={`flex flex-col ${isSent ? 'items-end' : 'items-start'} mb-[3px] group w-full`}>
      <div
        className={`relative max-w-[85%] md:max-w-[65%] px-2 pt-[6px] pb-[6px] rounded-lg shadow-sm text-sm ${
          isSent ? 'bg-[#005c4b] rounded-tr-none' : 'bg-[#202c33] rounded-tl-none'
        }`}
      >
        {/* Tail SVG */}
        {isSent ? (
          <span className="absolute -right-[8px] top-0 text-[#005c4b]">
            <svg viewBox="0 0 8 13" height="13" width="8" className="fill-current block">
              <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
            </svg>
          </span>
        ) : (
          <span className="absolute -left-[8px] top-0 text-[#202c33]">
            <svg viewBox="0 0 8 13" height="13" width="8" className="fill-current block">
              <path d="M1.533 3.568L8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"></path>
            </svg>
          </span>
        )}

        {/* Quoted Message */}
        {message.quoted_text && (
          <div
            className={`mb-1 p-2 rounded text-xs border-l-4 w-full overflow-hidden ${
              isSent ? 'bg-black/15 border-[#06cf9c] text-[#d1d7db]' : 'bg-black/20 border-[#8696a0] text-[#d1d7db]'
            }`}
          >
            <span className="font-medium block mb-0.5 opacity-70">Quoted</span>
            <div
              className="whitespace-pre-wrap break-words line-clamp-4 min-w-0 w-full opacity-90"
              style={{ wordBreak: 'break-word' }}
            >
              {message.quoted_text}
            </div>
          </div>
        )}

        {/* Media */}
        {hasRealMedia && <MediaContent message={message} />}

        {/* Content */}
        <div
          className="text-[#e9edef] px-1 leading-relaxed whitespace-pre-wrap break-words min-w-0 w-full text-[14.2px]"
          style={{ wordBreak: 'break-word' }}
        >
          {message.text_data ? (
            message.text_data
          ) : message.media_caption ? (
            message.media_caption
          ) : hasRealMedia ? null : (
            <div className="flex items-center text-[#8696a0] italic py-1">
              <ImageIcon size={16} className="mr-2" />
              <span>Media omitted</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-end mt-0.5 space-x-1 select-none px-1">
          <time className="text-[11px] text-[#8696a0] min-w-[42px] text-right">{formatTime(message.timestamp)}</time>
          {isSent && (
            <span className="text-[#53bdeb]">
              <Check size={14} strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { X, FileText, Image as ImageIcon } from 'lucide-react';

interface MediaGalleryItem {
  _id: number;
  timestamp: number;
  from_me: boolean;
  media_path: string;
  media_mime: string | null;
  media_caption: string | null;
}

interface MediaGalleryProps {
  chatId: number;
  chatName: string;
  onClose: () => void;
}

const isImage = (mime: string | null, path: string) =>
  (mime && mime.startsWith('image/')) || /\.(jpe?g|png|gif|webp)$/i.test(path);
const isVideo = (mime: string | null, path: string) =>
  (mime && mime.startsWith('video/')) || /\.(mp4|3gp|mov)$/i.test(path);
const isAudio = (mime: string | null, path: string) =>
  (mime && mime.startsWith('audio/')) || /\.(opus|ogg|m4a|mp3|amr)$/i.test(path);

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const GalleryThumb: React.FC<{ item: MediaGalleryItem; onOpen: () => void }> = ({ item, onOpen }) => {
  const [failed, setFailed] = useState(false);
  const src = `/api/media/${item._id}`;

  if (isImage(item.media_mime, item.media_path) && !failed) {
    return (
      <button onClick={onOpen} className="aspect-square bg-[#202c33] overflow-hidden">
        <img src={src} alt="" className="w-full h-full object-cover" onError={() => setFailed(true)} />
      </button>
    );
  }

  if (isVideo(item.media_mime, item.media_path) && !failed) {
    return (
      <button onClick={onOpen} className="aspect-square bg-[#202c33] overflow-hidden relative">
        <video src={src} className="w-full h-full object-cover" onError={() => setFailed(true)} muted />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
            <div className="w-0 h-0 border-y-[6px] border-y-transparent border-l-[9px] border-l-white ml-1" />
          </div>
        </div>
      </button>
    );
  }

  // Audio, documents, or failed images — a compact info tile instead of a broken thumbnail.
  return (
    <div className="aspect-square bg-[#202c33] flex flex-col items-center justify-center text-[#8696a0] p-2 gap-1">
      {isAudio(item.media_mime, item.media_path) ? (
        <span className="text-lg">🎤</span>
      ) : (
        <FileText size={22} />
      )}
      <span className="text-[10px] text-center truncate w-full">
        {item.media_path.split('/').pop()}
      </span>
    </div>
  );
};

/** Fullscreen viewer for a single gallery item, with sender + date context. */
const GalleryViewer: React.FC<{ item: MediaGalleryItem; chatName: string; onClose: () => void }> = ({
  item,
  chatName,
  onClose,
}) => {
  const src = `/api/media/${item._id}`;
  const senderLabel = item.from_me ? 'You' : chatName;

  return (
    <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between p-4 text-white flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-sm font-medium">{senderLabel}</div>
          <div className="text-xs text-white/60">{formatDate(item.timestamp)}</div>
        </div>
        <button onClick={onClose} className="p-2" aria-label="Close">
          <X size={24} />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {isImage(item.media_mime, item.media_path) ? (
          <img src={src} alt="" className="max-w-full max-h-full object-contain" />
        ) : isVideo(item.media_mime, item.media_path) ? (
          <video src={src} controls autoPlay className="max-w-full max-h-full" />
        ) : isAudio(item.media_mime, item.media_path) ? (
          <audio src={src} controls autoPlay className="w-full max-w-md" />
        ) : (
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-3 text-white"
          >
            <FileText size={48} />
            <span className="text-sm">{item.media_path.split('/').pop()}</span>
          </a>
        )}
      </div>
      {item.media_caption && (
        <div className="p-4 text-white text-sm text-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {item.media_caption}
        </div>
      )}
    </div>
  );
};

export const MediaGallery: React.FC<MediaGalleryProps> = ({ chatId, chatName, onClose }) => {
  const [items, setItems] = useState<MediaGalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openItem, setOpenItem] = useState<MediaGalleryItem | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/conversations/${chatId}/media`);
        const data = await res.json();
        setItems(data.items || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [chatId]);

  return (
    <div className="fixed inset-0 bg-[#111b21] z-50 flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div
        className="bg-[#202c33] px-4 py-[10px] flex items-center gap-3 flex-shrink-0"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 10px)', minHeight: '59px' }}
      >
        <button onClick={onClose} className="p-2 -ml-2 text-[#e9edef]" aria-label="Close media gallery">
          <X size={22} />
        </button>
        <div>
          <h2 className="text-[#e9edef] font-medium text-[16px]">Media, links and docs</h2>
          <p className="text-xs text-[#8696a0]">{chatName}</p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-1">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="w-7 h-7 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[#8696a0] text-sm gap-2">
            <ImageIcon size={40} className="text-[#364147]" />
            No media in this chat
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {items.map((item) => (
              <GalleryThumb key={item._id} item={item} onOpen={() => setOpenItem(item)} />
            ))}
          </div>
        )}
      </div>

      {openItem && <GalleryViewer item={openItem} chatName={chatName} onClose={() => setOpenItem(null)} />}
    </div>
  );
};

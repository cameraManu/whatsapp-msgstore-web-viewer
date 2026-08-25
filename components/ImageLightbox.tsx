import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * Fullscreen image viewer with WhatsApp-style zoom: scroll wheel to zoom on
 * desktop (centered on the cursor), pinch-to-zoom + drag-to-pan on touch,
 * and double-click/double-tap to toggle between fit and 2x zoom.
 */
export const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose }) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Drag-to-pan state (mouse or single-finger drag once zoomed in)
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Pinch state (two-finger touch)
  const pinchState = useRef<{ active: boolean; startDist: number; startScale: number; midX: number; midY: number }>({
    active: false,
    startDist: 0,
    startScale: 1,
    midX: 0,
    midY: 0,
  });

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Reset zoom/pan whenever a different image is shown.
  useEffect(() => {
    resetView();
  }, [src, resetView]);

  /** Zooms toward a specific point (cursor or pinch midpoint), keeping that point visually fixed. */
  const zoomToward = (clientX: number, clientY: number, newScale: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = clientX - rect.left - rect.width / 2;
    const cy = clientY - rect.top - rect.height / 2;

    setTranslate((prev) => {
      const ratio = newScale / scale;
      return {
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
    setScale(newScale);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = -e.deltaY * 0.0015;
    const newScale = clampScale(scale + delta * scale);
    if (newScale === scale) return;
    zoomToward(e.clientX, e.clientY, newScale);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1) {
      resetView();
    } else {
      zoomToward(e.clientX, e.clientY, 2.5);
    }
  };

  // --- Mouse drag-to-pan (only meaningful once zoomed in) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: translate.x,
      origY: translate.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setTranslate({ x: dragState.current.origX + dx, y: dragState.current.origY + dy });
    };
    const handleMouseUp = () => {
      dragState.current.dragging = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // --- Touch: pinch-to-zoom and single-finger pan ---
  const touchDist = (t: React.TouchList | TouchList) => {
    const [a, b] = [t[0], t[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchState.current = {
        active: true,
        startDist: touchDist(e.touches),
        startScale: scale,
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      dragState.current = {
        dragging: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        origX: translate.x,
        origY: translate.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (pinchState.current.active && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches);
      const ratio = dist / pinchState.current.startDist;
      const newScale = clampScale(pinchState.current.startScale * ratio);
      zoomToward(pinchState.current.midX, pinchState.current.midY, newScale);
    } else if (dragState.current.dragging && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragState.current.startX;
      const dy = e.touches[0].clientY - dragState.current.startY;
      setTranslate({ x: dragState.current.origX + dx, y: dragState.current.origY + dy });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchState.current.active = false;
    if (e.touches.length === 0) dragState.current.dragging = false;
  };

  const zoomButton = (delta: number) => () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newScale = clampScale(scale + delta);
    zoomToward(rect.left + rect.width / 2, rect.top + rect.height / 2, newScale);
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center overflow-hidden touch-none select-none"
      onClick={(e) => {
        if (e.target === containerRef.current) onClose();
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top controls */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 z-10"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="flex items-center gap-1 bg-black/40 rounded-full px-1">
          <button
            onClick={zoomButton(-0.5)}
            disabled={scale <= MIN_SCALE}
            className="text-white/90 hover:text-white p-2 disabled:opacity-30"
            aria-label="Zoom out"
          >
            <ZoomOut size={20} />
          </button>
          <span className="text-white/70 text-xs w-10 text-center select-none">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomButton(0.5)}
            disabled={scale >= MAX_SCALE}
            className="text-white/90 hover:text-white p-2 disabled:opacity-30"
            aria-label="Zoom in"
          >
            <ZoomIn size={20} />
          </button>
          {scale > 1 && (
            <button onClick={resetView} className="text-white/90 hover:text-white p-2" aria-label="Reset zoom">
              <RotateCcw size={16} />
            </button>
          )}
        </div>
        <button onClick={onClose} className="text-white/90 hover:text-white p-2 bg-black/40 rounded-full" aria-label="Close">
          <X size={22} />
        </button>
      </div>

      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        className="max-w-[95vw] max-h-[95vh] object-contain"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: dragState.current.dragging || pinchState.current.active ? 'none' : 'transform 0.15s ease-out',
          cursor: scale > 1 ? 'grab' : 'zoom-in',
        }}
      />
    </div>
  );
};

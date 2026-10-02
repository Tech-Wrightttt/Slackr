import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  X,
} from 'lucide-react';

interface ZoomableImageProps {
  src?: string;
  alt?: string;
  className?: string;
  title?: string;
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  src,
  alt = 'Question Diagram',
  className = '',
  title,
}) => {
  // Zoom level state (1.0 = 100%, 1.25 = 125%, 1.5 = 150%, 2.0 = 200%, etc.)
  const [scale, setScale] = useState<number>(1);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fullscreen modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalScale, setModalScale] = useState(1);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [isModalDragging, setIsModalDragging] = useState(false);
  const modalDragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  // Reset inline zoom
  const handleResetZoom = useCallback(() => {
    setScale(1);
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  }, []);

  // Zoom In button click
  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => {
      const next = Math.min(Number((prev + 0.25).toFixed(2)), 3);
      return next;
    });
  };

  // Zoom Out button click
  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => {
      const next = Math.max(Number((prev - 0.25).toFixed(2)), 1);
      return next;
    });
  };

  // Modal helpers
  const handleModalZoomIn = () => {
    setModalScale((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 5));
  };

  const handleModalZoomOut = () => {
    setModalScale((prev) => {
      const next = Math.max(Number((prev - 0.25).toFixed(2)), 0.5);
      if (next <= 1) setModalPos({ x: 0, y: 0 });
      return next;
    });
  };

  const resetModalZoom = useCallback(() => {
    setModalScale(1);
    setModalPos({ x: 0, y: 0 });
  }, []);

  // Modal pointer events
  const handleModalPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsModalDragging(true);
    modalDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: modalPos.x,
      posY: modalPos.y,
    };
  };

  const handleModalPointerMove = (e: React.PointerEvent) => {
    if (!isModalDragging) return;
    const deltaX = e.clientX - modalDragRef.current.startX;
    const deltaY = e.clientY - modalDragRef.current.startY;
    setModalPos({
      x: modalDragRef.current.posX + deltaX,
      y: modalDragRef.current.posY + deltaY,
    });
  };

  const handleModalPointerUp = (e: React.PointerEvent) => {
    if (isModalDragging) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setIsModalDragging(false);
    }
  };

  const handleModalWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.2 : -0.2;
    setModalScale((prev) => {
      const next = Math.min(Math.max(0.5, Number((prev + zoomDelta).toFixed(2))), 5);
      if (next <= 1) setModalPos({ x: 0, y: 0 });
      return next;
    });
  };

  // Modal keyboard shortcuts
  useEffect(() => {
    if (!isModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        resetModalZoom();
      } else if (e.key === '+' || e.key === '=') {
        handleModalZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        handleModalZoomOut();
      } else if (e.key === '0' || e.key === 'r' || e.key === 'R') {
        resetModalZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, resetModalZoom]);

  if (!src) return null;

  return (
    <>
      {/* Container: Image with dedicated control buttons positioned directly beside it */}
      <div className="my-6 flex justify-center w-full">
        <div className="inline-flex flex-col sm:flex-row items-center sm:items-center justify-center gap-3.5 max-w-full">
          {/* Image Display Frame - Clean and completely devoid of hover animations */}
          <div
            ref={containerRef}
            className="max-w-full overflow-auto rounded-2xl border border-slate-700/80 bg-slate-950 p-3 shadow-xl"
            style={{ maxHeight: '72vh' }}
          >
            {hasError ? (
              <div className="flex flex-col items-center justify-center py-10 px-8 text-slate-500">
                <span className="text-sm font-medium">Unable to load diagram image</span>
                <span className="font-mono text-xs text-slate-600 mt-1">{src}</span>
              </div>
            ) : (
              <img
                src={src}
                alt={alt}
                title={title || alt}
                loading="lazy"
                onError={() => setHasError(true)}
                style={{
                  // Smoothly and physically expand image dimensions when zooming in
                  width: scale === 1 ? 'auto' : `${Math.round(scale * 100)}%`,
                  maxWidth: scale === 1 ? '100%' : 'none',
                  maxHeight: scale === 1 ? '440px' : `${Math.round(440 * scale)}px`,
                  display: 'block',
                }}
                className={`rounded-xl object-contain transition-all duration-200 select-none ${className}`}
                draggable={false}
              />
            )}
          </div>

          {/* Control Buttons - Statically beside the image */}
          <div className="flex sm:flex-col items-center justify-center gap-2 p-2 rounded-2xl border border-slate-800 bg-slate-900/95 shadow-xl shrink-0">
            {/* Zoom In Button */}
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 3}
              title="Zoom In (+)"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <ZoomIn className="h-5 w-5" />
            </button>

            {/* Current Zoom Percentage */}
            <div className="min-w-[46px] py-1 text-center font-mono text-xs font-bold text-sky-400 select-none">
              {Math.round(scale * 100)}%
            </div>

            {/* Zoom Out Button */}
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 1}
              title="Zoom Out (-)"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors active:scale-95"
            >
              <ZoomOut className="h-5 w-5" />
            </button>

            {/* Reset Button (only shown when zoomed in) */}
            {scale > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom to 100%"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors active:scale-95"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}

            <div className="h-px w-full bg-slate-800 my-0.5 hidden sm:block" />
            <div className="w-px h-6 bg-slate-800 mx-0.5 sm:hidden" />

            {/* Fullscreen Inspector Button */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              title="Open Fullscreen Viewer"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-colors active:scale-95"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Inspector Lightbox Modal */}
      {isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md select-none"
            onWheel={handleModalWheel}
          >
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 border border-sky-500/20">
                  Diagram Inspector
                </span>
                <span className="hidden font-mono text-xs text-slate-400 sm:inline max-w-xs truncate">
                  {src.split('/').pop() || alt}
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-950 p-1">
                  <button
                    type="button"
                    title="Zoom Out"
                    onClick={handleModalZoomOut}
                    disabled={modalScale <= 0.5}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 disabled:opacity-30"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>

                  <span className="min-w-[45px] text-center font-mono text-xs font-bold text-sky-400">
                    {Math.round(modalScale * 100)}%
                  </span>

                  <button
                    type="button"
                    title="Zoom In"
                    onClick={handleModalZoomIn}
                    disabled={modalScale >= 5}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 disabled:opacity-30"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>

                  <div className="mx-1 h-4 w-px bg-slate-800" />

                  <button
                    type="button"
                    title="Reset"
                    onClick={resetModalZoom}
                    className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs text-slate-300 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                </div>

                <button
                  type="button"
                  title="Close (Esc)"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetModalZoom();
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Canvas */}
            <div
              onPointerDown={handleModalPointerDown}
              onPointerMove={handleModalPointerMove}
              onPointerUp={handleModalPointerUp}
              onPointerCancel={handleModalPointerUp}
              className={`relative flex flex-1 items-center justify-center overflow-hidden p-4 select-none ${
                isModalDragging
                  ? 'cursor-grabbing'
                  : modalScale > 1
                  ? 'cursor-grab'
                  : 'cursor-default'
              }`}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                style={{
                  transform: `translate(${modalPos.x}px, ${modalPos.y}px) scale(${modalScale})`,
                  transformOrigin: 'center center',
                }}
                className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Footer */}
            <footer className="flex h-10 shrink-0 items-center justify-center border-t border-slate-800 bg-slate-900/60 px-4 text-xs text-slate-400">
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span>Mouse Wheel: Zoom</span>
                <span>•</span>
                <span>Drag: Pan</span>
                <span>•</span>
                <span>Esc: Close</span>
              </div>
            </footer>
          </div>,
          document.body
        )}
    </>
  );
};

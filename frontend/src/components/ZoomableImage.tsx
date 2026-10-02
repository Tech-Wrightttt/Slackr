import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  const [scale, setScale] = useState<number>(1);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fullscreen modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalScale, setModalScale] = useState(1);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [isModalDragging, setIsModalDragging] = useState(false);
  const modalDragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });

  const handleResetZoom = useCallback(() => {
    setScale(1);
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScale((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.75));
  };

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
    setIsModalDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (err) {
      // ignore
    }
  };

  if (!src || hasError) {
    return (
      <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-outline-variant/30 bg-surface-container-low text-on-surface-variant text-center font-mono-code text-xs">
        <span className="material-symbols-outlined text-3xl mb-1 text-on-surface-variant/60">broken_image</span>
        <span>Diagram visual asset not available for offline preview</span>
      </div>
    );
  }

  return (
    <>
      <div className={`relative w-full rounded-xl bg-obsidian-surface-dim overflow-hidden flex flex-col md:flex-row border border-outline-variant/30 shadow-md ${className}`}>
        {/* Diagram Canvas Viewport */}
        <div
          ref={containerRef}
          className="relative flex-1 p-4 overflow-auto min-h-[220px] max-h-[380px] flex items-center justify-center bg-obsidian-surface dark:bg-obsidian-surface bg-surface-container-lowest"
        >
          <img
            src={src}
            alt={alt}
            onError={() => setHasError(true)}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
            className="max-h-[340px] w-auto max-w-full object-contain select-none transition-transform duration-75 cursor-grab active:cursor-grabbing"
          />
        </div>

        {/* Docked Schematic Control Toolbar */}
        <div className="flex md:flex-col items-center justify-between p-2 bg-surface-container-high/60 gap-2 shrink-0 border-t md:border-t-0 md:border-l border-outline-variant/30">
          <button
            onClick={handleZoomIn}
            aria-label="Zoom In Schematic"
            className="w-8 h-8 rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface font-mono-code transition-colors cursor-pointer"
            type="button"
            title="Zoom In (+25%)"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>

          <span className="font-mono-code text-on-surface-variant text-[11px] px-1 select-none font-semibold">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={handleZoomOut}
            aria-label="Zoom Out Schematic"
            className="w-8 h-8 rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface font-mono-code transition-colors cursor-pointer"
            type="button"
            title="Zoom Out (-25%)"
          >
            <span className="material-symbols-outlined text-[16px]">remove</span>
          </button>

          <div className="h-px w-4 md:w-full bg-outline-variant/30 my-0.5" />

          <button
            onClick={handleResetZoom}
            aria-label="Reset Zoom"
            className="w-8 h-8 rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            title="Reset Zoom to 100%"
            type="button"
          >
            <span className="material-symbols-outlined text-[15px]">refresh</span>
          </button>

          <button
            onClick={() => {
              setModalScale(1);
              setModalPos({ x: 0, y: 0 });
              setIsModalOpen(true);
            }}
            aria-label="Toggle Lightbox View"
            className="w-8 h-8 rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            title="Open Fullscreen Lightbox"
            type="button"
          >
            <span className="material-symbols-outlined text-[15px]">fullscreen</span>
          </button>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-xl animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsModalOpen(false);
            }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-outline-variant/30 bg-surface-container-lowest/80">
              <div className="flex items-center gap-3">
                <span className="font-label-caps text-xs text-primary uppercase">SCHEMATIC LIGHTBOX</span>
                <span className="font-mono-code text-xs text-on-surface">{title || alt}</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded-lg border border-outline-variant/30 font-mono-code text-xs">
                  <button
                    onClick={() => setModalScale((p) => Math.max(0.5, p - 0.25))}
                    className="p-1 hover:text-primary transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="px-2 font-bold">{Math.round(modalScale * 100)}%</span>
                  <button
                    onClick={() => setModalScale((p) => Math.min(5, p + 0.25))}
                    className="p-1 hover:text-primary transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setModalScale(1);
                    setModalPos({ x: 0, y: 0 });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                >
                  1:1
                </button>

                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg bg-surface-container hover:bg-error/20 hover:text-error transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Modal Viewport Canvas */}
            <div
              className="flex-1 overflow-hidden relative flex items-center justify-center p-4 cursor-grab active:cursor-grabbing select-none"
              onPointerDown={handleModalPointerDown}
              onPointerMove={handleModalPointerMove}
              onPointerUp={handleModalPointerUp}
              onPointerCancel={handleModalPointerUp}
            >
              <img
                src={src}
                alt={alt}
                style={{
                  transform: `translate(${modalPos.x}px, ${modalPos.y}px) scale(${modalScale})`,
                  transformOrigin: 'center center',
                }}
                className="max-h-[85vh] max-w-[90vw] object-contain transition-transform duration-75 pointer-events-none"
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

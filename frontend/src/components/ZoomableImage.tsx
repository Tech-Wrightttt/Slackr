import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ZoomableImageProps {
  src?: string;
  alt?: string;
  className?: string;
  title?: string;
}

const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const MODAL_MIN = 0.5;
const MODAL_MAX = 5;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 6;

const clampModal = (v: number) => Math.min(MODAL_MAX, Math.max(MODAL_MIN, v));

const isCoarsePointer = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

const btnTransition = { transition: 'background-color 120ms ease-out, color 120ms ease-out, transform 100ms ease-out' };

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  src,
  alt = 'Question Diagram',
  className = '',
  title,
}) => {
  const [scaleIndex, setScaleIndex] = useState<number>(0);
  const scale = ZOOM_STEPS[scaleIndex];

  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fullscreen modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalScale, setModalScale] = useState(1);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [isGesturing, setIsGesturing] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Mirrors of current values so gesture handlers never read stale state
  const scaleRef = useRef(modalScale);
  const posRef = useRef(modalPos);
  scaleRef.current = modalScale;
  posRef.current = modalPos;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startDist: 0, startScale: 1, panX: 0, panY: 0, posX: 0, posY: 0, moved: false });
  const lastTap = useRef(0);

  const handleResetZoom = useCallback(() => {
    setScaleIndex(0);
    containerRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }, []);

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScaleIndex((prev) => Math.min(prev + 1, ZOOM_STEPS.length - 1));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setScaleIndex((prev) => Math.max(prev - 1, 0));
  };

  const resetModalView = () => {
    setModalScale(1);
    setModalPos({ x: 0, y: 0 });
  };

  const openModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetModalView();
    setIsModalOpen(true);
    // History entry so the Android/PWA back gesture closes the lightbox instead of leaving the page
    window.history.pushState({ ...(window.history.state || {}), slackrLightbox: true }, '');
  };

  const closeModal = useCallback(() => {
    if (window.history.state?.slackrLightbox) {
      window.history.back(); // popstate listener below performs the close
    } else {
      setIsModalOpen(false);
    }
  }, []);

  // Ctrl/⌘ + wheel zoom on the inline viewer (plain wheel keeps scrolling the page)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) setScaleIndex((p) => Math.min(p + 1, ZOOM_STEPS.length - 1));
      else setScaleIndex((p) => Math.max(p - 1, 0));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [hasError]);

  // Lightbox lifecycle: keyboard, back gesture, body scroll lock, wheel zoom
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === '+' || e.key === '=') setModalScale((p) => clampModal(p + 0.25));
      if (e.key === '-') setModalScale((p) => clampModal(p - 0.25));
      if (e.key === '0') resetModalView();
    };
    const handlePop = () => setIsModalOpen(false);

    const canvas = canvasRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setModalScale((p) => clampModal(p + (e.deltaY < 0 ? 0.15 : -0.15)));
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    window.addEventListener('popstate', handlePop);
    canvas?.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('popstate', handlePop);
      canvas?.removeEventListener('wheel', onWheel);
      pointers.current.clear();
    };
  }, [isModalOpen, closeModal]);

  // Unified mouse / touch / pen gestures: 1 pointer = pan, 2 pointers = pinch, double-tap = toggle zoom
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (pointers.current.size === 1) {
      g.panX = e.clientX;
      g.panY = e.clientY;
      g.posX = posRef.current.x;
      g.posY = posRef.current.y;
      g.moved = false;
      setIsGesturing(true);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      g.startDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      g.startScale = scaleRef.current;
      g.moved = true;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setModalScale(clampModal(g.startScale * (dist / g.startDist)));
    } else {
      const dx = e.clientX - g.panX;
      const dy = e.clientY - g.panY;
      if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) g.moved = true;
      setModalPos({ x: g.posX + dx, y: g.posY + dy });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
    const g = gesture.current;

    if (pointers.current.size === 1) {
      // Pinch → pan handoff: re-anchor to the remaining finger so the image doesn't jump
      const [rest] = [...pointers.current.values()];
      g.panX = rest.x;
      g.panY = rest.y;
      g.posX = posRef.current.x;
      g.posY = posRef.current.y;
      return;
    }

    if (pointers.current.size === 0) {
      setIsGesturing(false);
      if (g.moved || e.type === 'pointercancel') return;
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        if (scaleRef.current > 1) resetModalView();
        else setModalScale(2.5);
      } else {
        lastTap.current = now;
      }
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

  const inlineBtn =
    'w-11 h-11 md:w-8 md:h-8 rounded-lg md:rounded bg-surface-container hover:bg-surface-bright flex items-center justify-center text-on-surface font-mono-code cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95';

  const coarse = isCoarsePointer();

  return (
    <>
      <div className={`relative w-full rounded-xl bg-obsidian-surface-dim overflow-hidden flex flex-col md:flex-row border border-outline-variant/30 shadow-md ${className}`}>
        {/* Diagram canvas — physical size scaling so overflow:auto actually scrolls to every edge */}
        <div
          ref={containerRef}
          className="relative flex-1 p-3 sm:p-4 overflow-auto min-h-[180px] sm:min-h-[220px] max-h-[min(380px,60dvh)] flex items-start justify-center bg-obsidian-surface dark:bg-obsidian-surface bg-surface-container-lowest styled-horizontal-scrollbar"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          <img
            src={src}
            alt={alt}
            onError={() => setHasError(true)}
            onDoubleClick={openModal}
            draggable={false}
            style={{
              width: scale === 1 ? 'auto' : `${Math.round(scale * 100)}%`,
              maxWidth: scale === 1 ? '100%' : 'none',
              height: 'auto',
              maxHeight: scale === 1 ? 'min(340px, 55dvh)' : 'none',
              display: 'block',
              transition: 'width 120ms ease-out',
            }}
            className="object-contain select-none"
          />
        </div>

        {/* Docked control toolbar — horizontal bar under the image on phones, side column on md+ */}
        <div className="flex md:flex-col items-center justify-between md:justify-start p-1.5 md:p-2 bg-surface-container-high/60 gap-1 md:gap-2 shrink-0 border-t md:border-t-0 md:border-l border-outline-variant/30">
          <div className="flex md:flex-col items-center gap-1 md:gap-2">
            <button onClick={handleZoomOut} disabled={scaleIndex === 0} aria-label="Zoom out" title="Zoom out (Ctrl+Scroll)" type="button" className={inlineBtn} style={btnTransition}>
              <span className="material-symbols-outlined text-[18px] md:text-[16px]">remove</span>
            </button>
            <span className="font-mono-code text-on-surface-variant text-[11px] w-11 md:w-auto text-center select-none font-semibold tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button onClick={handleZoomIn} disabled={scaleIndex === ZOOM_STEPS.length - 1} aria-label="Zoom in" title="Zoom in (Ctrl+Scroll)" type="button" className={inlineBtn} style={btnTransition}>
              <span className="material-symbols-outlined text-[18px] md:text-[16px]">add</span>
            </button>
          </div>

          <div className="hidden md:block h-px w-full bg-outline-variant/30 my-0.5" />

          <div className="flex md:flex-col items-center gap-1 md:gap-2">
            <button onClick={(e) => { e.stopPropagation(); handleResetZoom(); }} disabled={scaleIndex === 0} aria-label="Reset zoom" title="Reset zoom to 100%" type="button" className={inlineBtn} style={btnTransition}>
              <span className="material-symbols-outlined text-[17px] md:text-[15px]">refresh</span>
            </button>
            <button onClick={openModal} aria-label="Open fullscreen viewer" title="Fullscreen viewer" type="button" className={inlineBtn} style={btnTransition}>
              <span className="material-symbols-outlined text-[17px] md:text-[15px]">fullscreen</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen lightbox */}
      {isModalOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title || alt}
            className="fixed inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-xl h-[100dvh]"
            style={{ animation: 'fadeIn 180ms cubic-bezier(0.23,1,0.32,1) forwards' }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            {/* Header — padded below the notch / status bar in standalone PWA */}
            <div
              className="flex items-center justify-between gap-2 px-3 sm:px-6 pb-2 sm:pb-3 border-b border-outline-variant/30 bg-surface-container-lowest/80 shrink-0"
              style={{
                paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
                paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
                paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
              }}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="hidden sm:inline font-label-caps text-xs text-primary uppercase shrink-0">Schematic Lightbox</span>
                <span className="font-mono-code text-xs text-on-surface truncate">{title || alt}</span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <div className="flex items-center bg-surface-container rounded-lg border border-outline-variant/30 font-mono-code text-xs">
                  <button
                    onClick={() => setModalScale((p) => clampModal(p - 0.25))}
                    className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center hover:text-primary cursor-pointer active:scale-90"
                    style={btnTransition}
                    aria-label="Zoom out"
                    title="Zoom out (−)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px] sm:text-[16px]">remove</span>
                  </button>
                  <button
                    onClick={resetModalView}
                    className="px-1 font-bold tabular-nums w-12 text-center h-10 sm:h-8 cursor-pointer hover:text-primary"
                    style={btnTransition}
                    title="Reset to 100% (0)"
                    type="button"
                  >
                    {Math.round(modalScale * 100)}%
                  </button>
                  <button
                    onClick={() => setModalScale((p) => clampModal(p + 0.25))}
                    className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center hover:text-primary cursor-pointer active:scale-90"
                    style={btnTransition}
                    aria-label="Zoom in"
                    title="Zoom in (+)"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px] sm:text-[16px]">add</span>
                  </button>
                </div>

                <button
                  onClick={closeModal}
                  className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-surface-container hover:bg-error/20 hover:text-error flex items-center justify-center cursor-pointer active:scale-95"
                  style={btnTransition}
                  aria-label="Close viewer"
                  title="Close (Esc)"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Canvas — touch-action:none hands every touch to our gesture handlers (no page zoom/scroll) */}
            <div
              ref={canvasRef}
              className="flex-1 overflow-hidden relative flex items-center justify-center p-2 sm:p-4 cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                style={{
                  transform: `translate(${modalPos.x}px, ${modalPos.y}px) scale(${modalScale})`,
                  transformOrigin: 'center center',
                  transition: isGesturing ? 'none' : 'transform 200ms cubic-bezier(0.23,1,0.32,1)',
                }}
                className="max-h-full max-w-full object-contain pointer-events-none"
              />
            </div>

            {/* Gesture hint — sits above the home indicator */}
            <div
              className="flex items-center justify-center py-2 border-t border-outline-variant/20 bg-surface-container-lowest/60 shrink-0"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
              <span className="font-mono-code text-[11px] text-on-surface-variant/70 text-center px-4">
                {coarse
                  ? 'Pinch to zoom · Drag to pan · Double-tap to toggle zoom · Swipe back to close'
                  : 'Drag to pan · Scroll to zoom · Double-click to toggle · Esc to close'}
              </span>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

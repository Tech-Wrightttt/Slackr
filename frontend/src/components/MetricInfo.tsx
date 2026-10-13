import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { METRICS, type MetricId } from '../data/metricDefinitions';

// Only one tip open at a time across the page
const OPEN_EVENT = 'slackr:metric-info-open';
const PANEL_WIDTH = 360;
const GAP = 8;

const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

/**
 * (i) button next to a metric. Mouse: hover to peek. Touch, pen, keyboard: tap or Enter to open,
 * tap outside, Esc or the close button to dismiss. On phones the explanation opens as a bottom sheet.
 */
export const MetricInfo: React.FC<{ id: MetricId; className?: string }> = ({ id, className = '' }) => {
  const def = METRICS[id];
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false); // opened by click/tap: stays until dismissed
  const [sheet, setSheet] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);

  const show = useCallback((pin: boolean) => {
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panelId }));
    setSheet(isPhone());
    setPinned(pin);
    setOpen(true);
  }, [panelId]);

  const hide = useCallback((returnFocus = false) => {
    setOpen(false);
    setPinned(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Close when another tip opens
  useEffect(() => {
    const onOther = (e: Event) => {
      if ((e as CustomEvent).detail !== panelId) {
        setOpen(false);
        setPinned(false);
      }
    };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [panelId]);

  // Anchor the floating panel to the button; flip above when there is no room below
  const place = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * 12);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - width / 2), window.innerWidth - width - 12);
    const panelH = panelRef.current?.offsetHeight ?? 240;
    const above = r.bottom + GAP + panelH > window.innerHeight - 12 && r.top - GAP - panelH > 12;
    setPos({ top: above ? r.top - GAP - panelH : r.bottom + GAP, left, above });
  }, []);

  useLayoutEffect(() => {
    if (!open || sheet) return;
    place();
    // Measure again once the panel has its real height
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open, sheet, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide(true);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) hide();
    };
    const onMove = () => (sheet ? undefined : place());
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, sheet, hide, place]);

  // Sheet: move focus into it so screen readers and keyboards land on the explanation
  useEffect(() => {
    if (open && sheet) panelRef.current?.focus();
  }, [open, sheet]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const onEnter = () => {
    if (!canHover() || pinned) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => show(false), 120);
  };
  const onLeave = () => {
    if (!canHover() || pinned) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="font-title-sm text-sm font-bold text-on-surface">{def.title}</p>
        {(sheet || pinned) && (
          <button
            type="button"
            onClick={() => hide(true)}
            aria-label="Close"
            className="press-scale -mr-2 -mt-2 w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-on-surface-variant">{def.what}</p>
      <div className="flex flex-col gap-1.5">
        <p className="font-mono-code text-[11px] font-semibold uppercase tracking-wider text-primary">How it’s calculated</p>
        <div className="rounded-lg bg-surface-container-highest/60 px-3 py-2.5 font-mono-code text-[12px] leading-relaxed text-on-surface overflow-x-auto">
          {def.formula.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">{line}</div>
          ))}
        </div>
      </div>
      {'notes' in def && def.notes && (
        <ul className="flex flex-col gap-1 text-[12px] leading-relaxed text-on-surface-variant">
          {def.notes.map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-on-surface-variant/60" aria-hidden="true" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`How ${def.title} is calculated`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open && pinned ? hide() : show(true))}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={`metric-info-btn relative inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full align-middle cursor-pointer transition-colors ${
          open ? 'text-primary' : 'text-on-surface-variant/70 hover:text-primary'
        } ${className}`}
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true" style={open ? { fontVariationSettings: "'FILL' 1" } : undefined}>
          info
        </span>
      </button>

      {open &&
        createPortal(
          sheet ? (
            <div className="fixed inset-0 z-[70]">
              <div className="sheet-backdrop absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => hide(true)} />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-label={`How ${def.title} is calculated`}
                tabIndex={-1}
                className="metric-sheet absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-outline-variant/30 bg-surface-container-low px-5 pt-3 shadow-2xl outline-none flex flex-col gap-3"
                style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
              >
                <span className="mx-auto mb-1 h-1 w-10 rounded-full bg-outline-variant/60" aria-hidden="true" />
                {body}
              </div>
            </div>
          ) : (
            <div
              ref={panelRef}
              id={panelId}
              role={pinned ? 'dialog' : 'tooltip'}
              aria-label={pinned ? `How ${def.title} is calculated` : undefined}
              onMouseEnter={() => window.clearTimeout(hoverTimer.current)}
              onMouseLeave={onLeave}
              data-above={pos?.above ? 'true' : 'false'}
              className="metric-pop fixed z-[70] rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 shadow-xl flex flex-col gap-3 text-left"
              style={{
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                width: `min(${PANEL_WIDTH}px, calc(100vw - 24px))`,
                visibility: pos ? 'visible' : 'hidden',
              }}
            >
              {body}
            </div>
          ),
          document.body
        )}
    </>
  );
};

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import { boundsOf, isScribble, isTap, strokeTouchesBox, DOUBLE_TAP_MS, DOUBLE_TAP_PX } from './drawGestures';

type Tool = 'pen' | 'highlighter' | 'eraser';

interface Stroke {
  tool: 'pen' | 'highlighter';
  /** Palette key ('ink' | 'primary') or a literal color; resolved at paint time so ink follows the theme */
  color: string;
  size: number;
  /** Flat [x, y, pressure, ...] in page coordinates, so sketches scroll with the content */
  points: number[];
}

// Session-only memory: one sketch per question, gone on refresh by design
const sketches = new Map<string, Stroke[]>();

const PALETTE = [
  { key: 'ink', label: 'Ink' },
  { key: 'primary', label: 'Green' },
  { key: '#ef4444', label: 'Red' },
  { key: '#3b82f6', label: 'Blue' },
] as const;
const SIZES = [2, 4, 8] as const;

const ERASER_RADIUS = 14;
const HISTORY_LIMIT = 50;

const resolveColor = (key: string) => {
  if (key !== 'ink' && key !== 'primary') return key;
  const token = key === 'ink' ? '--color-on-surface' : '--color-primary';
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#191c19';
};

function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, ox: number, oy: number) {
  const p = s.points;
  if (p.length < 3) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle = resolveColor(s.color);
  if (s.tool === 'highlighter') {
    // One path so overlapping segments don't stack opacity
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = s.size * 4;
    ctx.beginPath();
    ctx.moveTo(p[0]! - ox, p[1]! - oy);
    for (let i = 3; i < p.length; i += 3) ctx.lineTo(p[i]! - ox, p[i + 1]! - oy);
    if (p.length === 3) ctx.lineTo(p[0]! - ox + 0.1, p[1]! - oy);
    ctx.stroke();
  } else if (p.length === 3) {
    ctx.beginPath();
    ctx.arc(p[0]! - ox, p[1]! - oy, s.size / 2 + 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Width follows stylus pressure; mouse and touch report a steady 0.5
    for (let i = 3; i < p.length; i += 3) {
      ctx.lineWidth = s.size * (0.5 + p[i + 2]!);
      ctx.beginPath();
      ctx.moveTo(p[i - 3]! - ox, p[i - 2]! - oy);
      ctx.lineTo(p[i]! - ox, p[i + 1]! - oy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

const strokeHit = (s: Stroke, x: number, y: number) => {
  const r = ERASER_RADIUS + (s.tool === 'highlighter' ? s.size * 2 : s.size / 2);
  for (let i = 0; i < s.points.length; i += 3) {
    const dx = s.points[i]! - x;
    const dy = s.points[i + 1]! - y;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
};

/**
 * Full-screen scribble layer over the whole app, shown while a question is on screen.
 * While drawing, the page underneath is locked: taps draw dots, keyboard shortcuts are held back,
 * and only the tool bar and the round toggle respond. Two fingers (or the mouse wheel) still scroll.
 */
export const DrawOverlay: React.FC = () => {
  const drawKey = useStore((s) => s.drawKey);
  const drawMode = useStore((s) => s.drawMode);
  const setDrawMode = useStore((s) => s.setDrawMode);
  const theme = useStore((s) => s.theme);
  const scribbleErase = useStore((s) => s.scribbleErase);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('ink');
  const [penSize, setPenSize] = useState<number>(SIZES[1]);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const historyRef = useRef<Stroke[][]>([]);
  // Snapshots undo stepped back from; any new change empties it (standard editor rule)
  const redoRef = useRef<Stroke[][]>([]);
  // Last touch/pen tap, so a second quick tap nearby undoes instead of drawing
  const lastTapRef = useRef<{ at: number; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  // Gesture state lives in refs: pointer events fire far too often for React state
  const g = useRef({
    mode: null as null | 'draw' | 'erase' | 'pan',
    pointerId: -1,
    erasedThisGesture: false,
    current: null as Stroke | null,
    pointers: new Map<number, { x: number; y: number }>(),
    lastPan: { x: 0, y: 0 },
    penSeen: false,
    downAt: 0,
    pointerType: '' as string,
  });
  const frame = useRef(0);
  const actionsRef = useRef({ undo: (): boolean => false, redo: () => {} });

  const strokes = () => (drawKey ? sketches.get(drawKey) ?? [] : []);
  const setStrokes = (next: Stroke[]) => {
    if (!drawKey) return;
    if (next.length) sketches.set(drawKey, next);
    else sketches.delete(drawKey);
  };

  // Repaint everything visible: committed strokes plus the one being drawn
  const paint = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = canvas.width / Math.max(1, window.innerWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const ox = window.scrollX;
    const oy = window.scrollY;
    const list = drawKey ? sketches.get(drawKey) ?? [] : [];
    for (const s of list) paintStroke(ctx, s, ox, oy);
    if (g.current.current) paintStroke(ctx, g.current.current, ox, oy);
  }, [drawKey]);

  const schedulePaint = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  // Canvas matches the viewport; page scroll just shifts the painted offset
  useLayoutEffect(() => {
    if (!drawKey) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      paint();
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', schedulePaint, { passive: true });
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', schedulePaint);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [drawKey, paint, schedulePaint]);

  // Lock the page's keyboard too (answer keys, Enter/Space advance). Esc leaves draw mode.
  useEffect(() => {
    if (!drawMode) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setDrawMode(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, [contenteditable="true"]')) return;
      // Ctrl+Z undoes; Ctrl+Y or Ctrl+Shift+Z redoes (Cmd on macOS)
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        const isRedo = key === 'y' || (key === 'z' && e.shiftKey);
        if (isRedo || key === 'z') {
          e.preventDefault();
          e.stopPropagation();
          if (isRedo) actionsRef.current.redo();
          else actionsRef.current.undo();
          return;
        }
      }
      // Keys aimed at the tool bar or toggle still work (Enter/Space on a focused tool)
      if (target?.closest?.('[data-draw-ui]')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [drawMode, setDrawMode]);

  // New question: fresh undo and redo history; ink color follows the theme
  useEffect(() => {
    historyRef.current = [];
    redoRef.current = [];
    lastTapRef.current = null;
    bump();
  }, [drawKey]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    paint();
  }, [theme, paint]);

  // Every change goes through here: it snapshots for undo and drops the redo branch
  const pushHistory = () => {
    historyRef.current.push(strokes());
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    redoRef.current = [];
  };

  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1200);
  };

  const centroid = () => {
    let x = 0;
    let y = 0;
    for (const p of g.current.pointers.values()) {
      x += p.x;
      y += p.y;
    }
    const n = Math.max(1, g.current.pointers.size);
    return { x: x / n, y: y / n };
  };

  const eraseAt = (clientX: number, clientY: number) => {
    const x = clientX + window.scrollX;
    const y = clientY + window.scrollY;
    const before = strokes();
    const keep = before.filter((s) => !strokeHit(s, x, y));
    if (keep.length === before.length) return;
    if (!g.current.erasedThisGesture) {
      pushHistory();
      g.current.erasedThisGesture = true;
    }
    setStrokes(keep);
    schedulePaint();
    bump();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = g.current;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType === 'pen') s.penSeen = true;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two fingers scroll; after a stylus is used, a resting palm or finger scrolls instead of drawing
    if (e.pointerType === 'touch' && (s.pointers.size >= 2 || s.penSeen)) {
      if (s.mode === 'draw') s.current = null;
      s.mode = 'pan';
      s.lastPan = centroid();
      schedulePaint();
      return;
    }
    if (s.mode) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    s.pointerId = e.pointerId;
    s.erasedThisGesture = false;
    s.downAt = e.timeStamp;
    s.pointerType = e.pointerType;
    if (tool === 'eraser') {
      s.mode = 'erase';
      eraseAt(e.clientX, e.clientY);
      return;
    }
    s.mode = 'draw';
    s.current = {
      tool,
      color,
      size: penSize,
      points: [e.clientX + window.scrollX, e.clientY + window.scrollY, e.pointerType === 'pen' ? e.pressure : 0.5],
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = g.current;
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.mode === 'pan') {
      const c = centroid();
      window.scrollBy(s.lastPan.x - c.x, s.lastPan.y - c.y);
      s.lastPan = c;
      return;
    }
    if (e.pointerId !== s.pointerId || !s.mode) return;

    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    if (s.mode === 'erase') {
      for (const ev of events) eraseAt(ev.clientX, ev.clientY);
      return;
    }
    const cur = s.current;
    if (!cur) return;
    for (const ev of events) {
      cur.points.push(ev.clientX + window.scrollX, ev.clientY + window.scrollY, ev.pointerType === 'pen' ? ev.pressure : 0.5);
    }
    schedulePaint();
  };

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const s = g.current;
    s.pointers.delete(e.pointerId);
    if (s.mode === 'pan') {
      if (s.pointers.size === 0) s.mode = null;
      else s.lastPan = centroid();
      return;
    }
    if (e.pointerId !== s.pointerId) return;

    // A tap just leaves a dot: nothing under the canvas is pressed while drawing
    if (s.mode === 'draw' && s.current) {
      const cur = s.current;
      s.current = null;
      if (!cancelled) commitStroke(cur, e.timeStamp);
      schedulePaint();
    }
    s.mode = null;
    s.pointerId = -1;
  };

  const commitStroke = (cur: Stroke, upAt: number) => {
    const s = g.current;
    // Touch and pen: a second quick tap next to the first undoes, and neither tap leaves a dot
    if (s.pointerType === 'touch' || s.pointerType === 'pen') {
      if (isTap(upAt - s.downAt, cur.points)) {
        const tap = { at: upAt, x: cur.points[0]!, y: cur.points[1]! };
        const last = lastTapRef.current;
        if (last && tap.at - last.at <= DOUBLE_TAP_MS && Math.hypot(tap.x - last.x, tap.y - last.y) <= DOUBLE_TAP_PX) {
          lastTapRef.current = null;
          // Drop the first tap's dot without making it redoable, then undo the stroke before it
          const beforeDot = historyRef.current.pop();
          if (beforeDot) setStrokes(beforeDot);
          if (undo()) showToast('Undone');
          else bump();
          return;
        }
        lastTapRef.current = tap;
      } else {
        lastTapRef.current = null;
      }
    }

    // Scribbling over ink with the pen erases what it covers; the scribble itself is dropped too
    if (scribbleErase && cur.tool === 'pen' && isScribble(cur.points)) {
      const box = boundsOf(cur.points);
      const before = strokes();
      const keep = before.filter((st) => !strokeTouchesBox(st.points, box, (st.size + cur.size) / 2));
      if (keep.length < before.length) {
        pushHistory();
        setStrokes(keep);
        bump();
        showToast(`Erased ${before.length - keep.length}`);
        return;
      }
    }

    pushHistory();
    setStrokes([...strokes(), cur]);
    bump();
  };

  /** Returns false when there was nothing to undo */
  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return false;
    redoRef.current.push(strokes());
    setStrokes(prev);
    schedulePaint();
    bump();
    return true;
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(strokes());
    setStrokes(next);
    schedulePaint();
    bump();
  };
  // The key handler is bound once per draw session; it reaches the latest undo/redo through here
  actionsRef.current = { undo, redo };

  const clearAll = () => {
    if (!strokes().length) return;
    pushHistory();
    setStrokes([]);
    schedulePaint();
    bump();
  };

  if (!drawKey) return null;

  const strokeCount = strokes().length;
  const canUndo = historyRef.current.length > 0;
  const canRedo = redoRef.current.length > 0;

  return createPortal(
    <>
      {/* Above every page element; only catches input while draw mode is on */}
      <canvas
        ref={canvasRef}
        className={`draw-surface fixed inset-0 z-[9990] h-full w-full ${drawMode ? 'pointer-events-auto' : 'pointer-events-none'}`}
        data-active={drawMode}
        data-tool={tool}
        aria-hidden="true"
        onPointerDown={drawMode ? onPointerDown : undefined}
        onPointerMove={drawMode ? onPointerMove : undefined}
        onPointerUp={drawMode ? (e) => endGesture(e, false) : undefined}
        onPointerCancel={drawMode ? (e) => endGesture(e, true) : undefined}
        onContextMenu={drawMode ? (e) => e.preventDefault() : undefined}
      />

      {drawMode && (
        <div
          role="toolbar"
          aria-label="Drawing tools"
          data-draw-ui
          className="draw-toolbar fixed z-[9999] flex flex-wrap items-center justify-end gap-1 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest/95 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.2)] backdrop-blur-xl"
        >
          {(
            [
              ['pen', 'stylus', 'Pen'],
              ['highlighter', 'ink_highlighter', 'Highlighter'],
              ['eraser', 'ink_eraser', 'Eraser'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-pressed={tool === key}
              title={label}
              onClick={() => setTool(key)}
              className={`press-scale draw-tool ${tool === key ? 'is-active' : ''}`}
            >
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
            </button>
          ))}

          <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-outline-variant/50 sm:block" aria-hidden="true" />

          {PALETTE.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label={`${c.label} color`}
              aria-pressed={color === c.key}
              title={c.label}
              onClick={() => {
                setColor(c.key);
                if (tool === 'eraser') setTool('pen');
              }}
              className={`press-scale draw-tool ${color === c.key && tool !== 'eraser' ? 'is-active' : ''}`}
            >
              <span
                className="h-5 w-5 rounded-full ring-1 ring-black/10"
                style={{
                  backgroundColor:
                    c.key === 'ink' ? 'var(--color-on-surface)' : c.key === 'primary' ? 'var(--color-primary)' : c.key,
                }}
              />
            </button>
          ))}

          <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-outline-variant/50 sm:block" aria-hidden="true" />

          {SIZES.map((sz) => (
            <button
              key={sz}
              type="button"
              aria-label={`Stroke size ${sz}`}
              aria-pressed={penSize === sz}
              title={`Size ${sz}`}
              onClick={() => setPenSize(sz)}
              className={`press-scale draw-tool ${penSize === sz ? 'is-active' : ''}`}
            >
              <span className="rounded-full bg-on-surface" style={{ width: sz + 3, height: sz + 3 }} />
            </button>
          ))}

          <span className="mx-0.5 hidden h-6 w-px shrink-0 bg-outline-variant/50 sm:block" aria-hidden="true" />

          <button
            type="button"
            aria-label="Undo"
            title="Undo (Ctrl+Z, or double-tap with a finger or pen)"
            disabled={!canUndo}
            onClick={() => undo()}
            className="press-scale draw-tool"
          >
            <span className="material-symbols-outlined text-[20px]">undo</span>
          </button>
          <button
            type="button"
            aria-label="Redo"
            title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={redo}
            className="press-scale draw-tool"
          >
            <span className="material-symbols-outlined text-[20px]">redo</span>
          </button>
          <button
            type="button"
            aria-label="Clear drawing"
            title="Clear"
            disabled={strokeCount === 0}
            onClick={clearAll}
            className="press-scale draw-tool"
          >
            <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
          </button>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="draw-toast pointer-events-none fixed left-1/2 z-[9999] -translate-x-1/2 rounded-full bg-on-surface px-4 py-2 text-sm font-semibold text-surface shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Floating draw toggle, bottom right, clear of the home indicator */}
      <button
        type="button"
        onClick={() => setDrawMode(!drawMode)}
        data-draw-ui
        aria-pressed={drawMode}
        aria-label={drawMode ? 'Stop drawing' : 'Draw on the screen'}
        title={drawMode ? 'Stop drawing' : 'Draw on the screen'}
        className={`draw-fab press-scale fixed z-[9999] flex h-14 w-14 items-center justify-center rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.25)] ${
          drawMode ? 'bg-on-surface text-surface' : 'bg-primary text-on-primary'
        }`}
      >
        <span className="material-symbols-outlined text-[26px]">{drawMode ? 'close' : 'draw'}</span>
      </button>
    </>,
    document.body
  );
};

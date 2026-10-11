import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';

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

const TAP_MAX_MOVE = 6; // px: shorter gestures are taps that press whatever is underneath
const TAP_MAX_MS = 350;
const ERASER_RADIUS = 14;
const HISTORY_LIMIT = 50;
const CLICKABLE = 'button, a, input, select, textarea, label, summary, [role="button"], [tabindex]';

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

/** A tap in draw mode still presses what's underneath: answer choices, Submit, Next, the question grid. */
function forwardClick(canvas: HTMLElement, clientX: number, clientY: number) {
  canvas.style.pointerEvents = 'none';
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  canvas.style.pointerEvents = '';
  if (!hit) return;
  const target = (hit.closest(CLICKABLE) as HTMLElement | null) ?? hit;
  if (target.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select')) target.focus();
  target.click();
}

/**
 * Full-screen scribble layer over the whole app, shown while a question is on screen.
 * Drag to draw, tap to press buttons underneath, two fingers to scroll.
 */
export const DrawOverlay: React.FC = () => {
  const drawKey = useStore((s) => s.drawKey);
  const drawMode = useStore((s) => s.drawMode);
  const setDrawMode = useStore((s) => s.setDrawMode);
  const theme = useStore((s) => s.theme);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>('ink');
  const [penSize, setPenSize] = useState<number>(SIZES[1]);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const historyRef = useRef<Stroke[][]>([]);
  // Gesture state lives in refs: pointer events fire far too often for React state
  const g = useRef({
    mode: null as null | 'draw' | 'erase' | 'pan',
    pointerId: -1,
    downX: 0,
    downY: 0,
    downT: 0,
    moved: false,
    erasedThisGesture: false,
    current: null as Stroke | null,
    pointers: new Map<number, { x: number; y: number }>(),
    lastPan: { x: 0, y: 0 },
    penSeen: false,
  });
  const frame = useRef(0);

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

  // New question: fresh undo history; ink color follows the theme
  useEffect(() => {
    historyRef.current = [];
    bump();
  }, [drawKey]);
  useEffect(() => {
    paint();
  }, [theme, paint]);

  const pushHistory = () => {
    historyRef.current.push(strokes());
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
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
    s.downX = e.clientX;
    s.downY = e.clientY;
    s.downT = performance.now();
    s.moved = false;
    s.erasedThisGesture = false;
    if (tool === 'eraser') {
      s.mode = 'erase';
      return; // erases only once the pointer moves, so a tap still clicks through
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
    if (!s.moved && Math.hypot(e.clientX - s.downX, e.clientY - s.downY) > TAP_MAX_MOVE) s.moved = true;

    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    if (s.mode === 'erase') {
      if (s.moved) for (const ev of events) eraseAt(ev.clientX, ev.clientY);
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

    const isTap = !s.moved && performance.now() - s.downT < TAP_MAX_MS;
    if (s.mode === 'draw' && s.current) {
      const cur = s.current;
      s.current = null;
      if (!isTap) {
        pushHistory();
        setStrokes([...strokes(), cur]);
        bump();
      }
      schedulePaint();
    }
    s.mode = null;
    s.pointerId = -1;
    if (isTap && !cancelled && canvasRef.current) forwardClick(canvasRef.current, e.clientX, e.clientY);
  };

  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    setStrokes(prev);
    schedulePaint();
    bump();
  };

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

          <button type="button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo} className="press-scale draw-tool">
            <span className="material-symbols-outlined text-[20px]">undo</span>
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

      {/* Floating draw toggle, bottom right, clear of the home indicator */}
      <button
        type="button"
        onClick={() => setDrawMode(!drawMode)}
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

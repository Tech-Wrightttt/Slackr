/**
 * Gesture detection for the draw overlay. Points are flat [x, y, pressure, ...] arrays, the same
 * layout the overlay stores, so strokes can be tested without copying.
 */

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const boundsOf = (p: readonly number[]): Box => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]!;
    const y = p[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
};

const pathLength = (p: readonly number[]) => {
  let len = 0;
  for (let i = 3; i < p.length; i += 3) len += Math.hypot(p[i]! - p[i - 3]!, p[i + 1]! - p[i - 2]!);
  return len;
};

/** Ignore jitter smaller than this when tracking direction */
const JITTER_PX = 4;

/**
 * Sweeps along one axis: lengths of the runs between direction reversals.
 * A zigzag gives several runs that each cross most of the box.
 */
const axisRuns = (p: readonly number[], axis: 0 | 1): number[] => {
  const runs: number[] = [];
  let dir = 0;
  let anchor = p[axis]!;
  let runStart = anchor;
  for (let i = 3; i < p.length; i += 3) {
    const v = p[i + axis]!;
    const delta = v - anchor;
    if (Math.abs(delta) < JITTER_PX) continue;
    const d = Math.sign(delta);
    if (dir !== 0 && d !== dir) {
      runs.push(Math.abs(anchor - runStart));
      runStart = anchor;
    }
    dir = d;
    anchor = v;
  }
  runs.push(Math.abs(anchor - runStart));
  return runs;
};

export const SCRIBBLE_MIN_REVERSALS = 4;
export const SCRIBBLE_MIN_LENGTH_RATIO = 3;

/**
 * A scribble is a back-and-forth zigzag: along one axis it reverses at least 4 times with runs that
 * each cross over half the box, and its path is over 3x the box diagonal. Circles reverse twice,
 * lines never, and handwriting moves forward along its long axis, so none of them qualify.
 */
export function isScribble(p: readonly number[]): boolean {
  if (p.length < 3 * 8) return false;
  const b = boundsOf(p);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const diag = Math.hypot(w, h);
  if (diag < 12 || pathLength(p) / diag < SCRIBBLE_MIN_LENGTH_RATIO) return false;
  const extents = [w, h] as const;
  return ([0, 1] as const).some((axis) => {
    const extent = extents[axis];
    // The sweep must run across the box, not along a narrow band (cursive "mmm" sweeps its short axis)
    if (extent < 0.4 * extents[axis === 0 ? 1 : 0]) return false;
    const long = axisRuns(p, axis).filter((r) => r >= extent * 0.5).length;
    return long >= SCRIBBLE_MIN_REVERSALS + 1;
  });
}

const segmentNearBox = (x1: number, y1: number, x2: number, y2: number, b: Box) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
  for (let s = 0; s <= steps; s++) {
    const x = x1 + ((x2 - x1) * s) / steps;
    const y = y1 + ((y2 - y1) * s) / steps;
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) return true;
  }
  return false;
};

/** True when a stroke has a point inside, or a segment crossing, the scribble's box (grown by `pad`) */
export function strokeTouchesBox(p: readonly number[], box: Box, pad: number): boolean {
  const b = { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
  if (p.length === 3) return segmentNearBox(p[0]!, p[1]!, p[0]!, p[1]!, b);
  for (let i = 3; i < p.length; i += 3) {
    if (segmentNearBox(p[i - 3]!, p[i - 2]!, p[i]!, p[i + 1]!, b)) return true;
  }
  return false;
}

/** A tap: a short press that barely moves */
export const TAP_MAX_MS = 200;
export const TAP_MAX_MOVE_PX = 10;
/** Two taps this close in time and space make a double tap */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 30;

export const isTap = (durationMs: number, p: readonly number[]) => {
  if (durationMs > TAP_MAX_MS) return false;
  const b = boundsOf(p);
  return Math.hypot(b.maxX - b.minX, b.maxY - b.minY) < TAP_MAX_MOVE_PX;
};

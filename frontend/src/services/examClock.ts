/**
 * Exam countdown with one source of truth: wall-clock differences, never interval ticks, so the
 * time stays right while the tab sleeps in the background or the page reloads.
 */
export interface ExamClock {
  durationMs: number;
  /** Time used while paused segments are excluded */
  bankedMs: number;
  /** Epoch ms the clock last started running; null while paused */
  runningSince: number | null;
}

export const startClock = (durationMs: number, now: number): ExamClock => ({ durationMs, bankedMs: 0, runningSince: now });

export const elapsedMs = (c: ExamClock, now: number) => c.bankedMs + (c.runningSince === null ? 0 : Math.max(0, now - c.runningSince));

export const remainingMs = (c: ExamClock, now: number) => Math.max(0, c.durationMs - elapsedMs(c, now));

export const isPaused = (c: ExamClock) => c.runningSince === null;

export const pauseClock = (c: ExamClock, now: number): ExamClock =>
  isPaused(c) ? c : { ...c, bankedMs: elapsedMs(c, now), runningSince: null };

export const resumeClock = (c: ExamClock, now: number): ExamClock => (isPaused(c) ? { ...c, runningSince: now } : c);

export const isExpired = (c: ExamClock, now: number) => remainingMs(c, now) <= 0;

export const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

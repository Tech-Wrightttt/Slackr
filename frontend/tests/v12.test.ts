import { describe, expect, it } from 'vitest';
import type { AttemptRecord, QuestionData, SessionQuestionLog } from '../src/db/schema';
import {
  displayOrder,
  formatBlankPicks,
  isBlanksCorrect,
  isCorrectKey,
  isPositional,
  isSelfGraded,
  parseBlankPicks,
  seededShuffle,
} from '../src/services/choiceOrder';
import { accuracyOfTotal, buildMockPaper, mockScore, MOCK_PAPER_SIZE, PASS_LINE } from '../src/services/scoring';
import { buildSessionReport } from '../src/services/sessionReport';
import { elapsedMs, formatClock, isExpired, pauseClock, remainingMs, resumeClock, startClock } from '../src/services/examClock';
import { isScribble, isTap, strokeTouchesBox, boundsOf } from '../src/components/drawGestures';
import { computeYearDetail } from '../src/services/yearDetail';
import { QuestionsService } from '../src/services/questionsService';

const q = (over: Partial<QuestionData> = {}): QuestionData => ({
  id: 'Q1',
  year: '2024',
  season: 'S',
  paper: 'FE-A',
  number: 1,
  tags: [],
  topics: ['networking'],
  question: 'Which?',
  options: { a: 'one', b: 'two', c: 'three', d: 'four' },
  fallback_choices: ['a', 'b', 'c', 'd'],
  correct: 'b',
  correct_display: 'b) two',
  explanation: '',
  image_paths: [],
  all_images: [],
  is_image_based: false,
  session_id: '2024S_FE-A',
  ...over,
});

describe('choice order (shuffle)', () => {
  it('is stable for a seed and differs across seeds', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(seededShuffle(items, 'x')).toEqual(seededShuffle(items, 'x'));
    const orders = new Set(['s1', 's2', 's3', 's4', 's5'].map((s) => seededShuffle(items, s).join('')));
    expect(orders.size).toBeGreaterThan(1);
    expect(seededShuffle(items, 'x').slice().sort()).toEqual(items);
  });

  it('keeps the original order without a seed or for positional choices', () => {
    expect(displayOrder(q(), null)).toEqual(['a', 'b', 'c', 'd']);
    const positional = q({ options: { a: 'x', b: 'y', c: 'Both a and b', d: 'None of the above' } });
    expect(isPositional(positional)).toBe(true);
    expect(displayOrder(positional, 'seed')).toEqual(['a', 'b', 'c', 'd']);
    expect(isPositional(q({ options: { a: '![img](/files/x.png)', b: 'y' } }))).toBe(true);
    expect(isPositional(q())).toBe(false);
  });

  it('grades against the original key whatever the display order', () => {
    const question = q();
    const order = displayOrder(question, 'seed-7');
    expect(order.slice().sort()).toEqual(['a', 'b', 'c', 'd']);
    const shownIndexOfCorrect = order.indexOf('b');
    expect(isCorrectKey(question, order[shownIndexOfCorrect]!)).toBe(true);
    expect(isCorrectKey(q({ correct: 'c) 14.0' }), 'c')).toBe(true);
  });

  it('grades and round-trips multi-blank answers', () => {
    const question = q({ correct: 'A=c, B=e', blanks: [{ label: 'A', correct: 'c' }, { label: 'B', correct: 'e' }] });
    expect(isBlanksCorrect(question, { A: 'c', B: 'e' })).toBe(true);
    expect(isBlanksCorrect(question, { A: 'c', B: 'd' })).toBe(false);
    const stored = formatBlankPicks(question, { A: 'c', B: 'e' });
    expect(stored).toBe('A=c, B=e');
    expect(parseBlankPicks(stored)).toEqual({ A: 'c', B: 'e' });
  });

  it('marks image or free-text answer keys as self-graded', () => {
    expect(isSelfGraded(q({ correct: '![key](/files/k.png)' }))).toBe(true);
    expect(isSelfGraded(q())).toBe(false);
  });
});

describe('scoring', () => {
  it('divides accuracy by the whole set, so skips count as wrong', () => {
    expect(accuracyOfTotal(6, 10)).toBe(60);
    expect(accuracyOfTotal(0, 0)).toBe(0);
  });

  it('weights by tier and normalizes each paper to 1000', () => {
    const qs = [q({ id: 'r', weight_tier: 1 }), q({ id: 's', weight_tier: 3 })];
    expect(mockScore(qs, new Set(['s'])).score).toBe(750);
    expect(mockScore(qs, new Set(['r'])).score).toBe(250);
    const twoPapers = [q({ id: 'a', session_id: 'P1' }), q({ id: 'b', session_id: 'P2' })];
    const res = mockScore(twoPapers, new Set(['a']));
    expect(res.papers.map((p) => p.score).sort()).toEqual([0, 1000]);
    expect(res.score).toBe(500);
    expect(res.passed).toBe(false);
    expect(PASS_LINE).toBe(600);
  });

  it('builds a mock paper with the pool tier mix', () => {
    const pool: QuestionData[] = [];
    for (let i = 0; i < 300; i++) pool.push(q({ id: `t${i}`, number: i, weight_tier: i < 180 ? 1 : i < 270 ? 2 : 3 }));
    pool.push(q({ id: 'pm', paper: 'PM', weight_tier: 3 }));
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const paper = buildMockPaper(pool, rand);
    expect(paper).toHaveLength(MOCK_PAPER_SIZE);
    expect(new Set(paper.map((p) => p.id)).size).toBe(MOCK_PAPER_SIZE);
    expect(paper.some((p) => p.paper === 'PM')).toBe(false);
    const tier1 = paper.filter((p) => p.weight_tier === 1).length;
    expect(tier1).toBe(36); // 60% of the pool, 60% of the paper
  });
});

describe('question sets', () => {
  it('filters by kind and ranks frequently tested by repeat count', () => {
    const qs = [
      q({ id: 'a', kind: 'recall', repeat_count: 1 }),
      q({ id: 'b', kind: 'solving', repeat_count: 3 }),
      q({ id: 'c', kind: 'recall', repeat_count: 5 }),
    ];
    expect(QuestionsService.filterByKind(qs, 'recall').map((x) => x.id)).toEqual(['a', 'c']);
    expect(QuestionsService.filterByKind(qs, 'all')).toHaveLength(3);
    expect(QuestionsService.filterFrequentlyTested(qs).map((x) => x.id)).toEqual(['c', 'b']);
  });
});

describe('session report', () => {
  const qs = Object.fromEntries(
    ['a', 'b', 'c', 'd'].map((id, i) => [id, q({ id, topics: [i < 2 ? 'networking' : 'math'] })])
  );
  const log: SessionQuestionLog[] = [
    { questionId: 'a', timeSeconds: 10, finalChoice: 'b', isCorrect: true, choiceSwitches: 3, touchedCorrect: true, flagged: false, confidence: 5 },
    { questionId: 'b', timeSeconds: 5, finalChoice: 'a', isCorrect: false, choiceSwitches: 2, touchedCorrect: true, flagged: true, confidence: 4 },
    { questionId: 'c', timeSeconds: 100, finalChoice: 'c', isCorrect: false, choiceSwitches: 0, flagged: false, confidence: 2 },
    { questionId: 'd', timeSeconds: 0, finalChoice: null, isCorrect: null, choiceSwitches: 0, flagged: false },
  ];

  it('computes every section from the log', () => {
    const r = buildSessionReport(log, qs, { withMockScore: true, previous: [log[0]!, { ...log[0]!, questionId: 'x', isCorrect: false }] });
    expect(r.accuracy).toBe(25);
    expect(r.skipped).toBe(1);
    expect(r.skippedIds).toEqual(['d']);
    expect(r.flaggedIds).toEqual(['b']);
    expect(r.slowest[0]!.questionId).toBe('c');
    expect(r.fastest[0]).toMatchObject({ questionId: 'b', rushed: true });
    expect(r.switchedToRight).toEqual(['a']);
    expect(r.switchedAwayFromRight).toEqual(['b']);
    expect(r.fooled).toEqual({ wrong: 1, total: 2 });
    expect(r.firstHalfAccuracy).toBe(50);
    expect(r.secondHalfAccuracy).toBe(0);
    expect(r.timeOnWrongShare).toBeCloseTo(105 / 115);
    expect(r.previousAccuracy).toBe(50);
    expect(r.reviewIds).toEqual(['b', 'c', 'd']);
    expect(r.byTopic[0]).toMatchObject({ topic: 'math', accuracy: 0 });
    expect(r.mock?.score).toBe(250);
  });
});

describe('exam clock', () => {
  it('pauses and resumes from wall-clock differences', () => {
    let c = startClock(60_000, 1_000);
    expect(remainingMs(c, 11_000)).toBe(50_000);
    c = pauseClock(c, 11_000);
    // Time passes while paused: nothing is used
    expect(remainingMs(c, 500_000)).toBe(50_000);
    c = resumeClock(c, 500_000);
    expect(elapsedMs(c, 505_000)).toBe(15_000);
  });

  it('expires at zero so the exam submits itself', () => {
    const c = startClock(30_000, 0);
    expect(isExpired(c, 29_999)).toBe(false);
    expect(isExpired(c, 30_000)).toBe(true);
    expect(remainingMs(c, 99_999)).toBe(0);
  });

  it('formats the countdown', () => {
    expect(formatClock(90 * 60_000)).toBe('1:30:00');
    expect(formatClock(65_000)).toBe('01:05');
  });
});

// Flat [x, y, pressure] points from (x, y) pairs
const pts = (pairs: Array<[number, number]>) => pairs.flatMap(([x, y]) => [x, y, 0.5]);
const line = (x0: number, y0: number, x1: number, y1: number, n = 20) =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n] as [number, number]);

describe('scribble erase detection', () => {
  it('a zigzag is a scribble', () => {
    const zig: Array<[number, number]> = [];
    for (let i = 0; i < 6; i++) zig.push(...line(i % 2 ? 100 : 0, i * 6, i % 2 ? 0 : 100, i * 6 + 6, 8));
    expect(isScribble(pts(zig))).toBe(true);
  });

  it('a circle, a straight line and handwriting are not', () => {
    const circle = Array.from({ length: 60 }, (_, i) => [50 + 40 * Math.cos((i / 60) * 2 * Math.PI), 50 + 40 * Math.sin((i / 60) * 2 * Math.PI)] as [number, number]);
    expect(isScribble(pts(circle))).toBe(false);
    expect(isScribble(pts(line(0, 0, 200, 10)))).toBe(false);
    // Cursive "abc": loops moving steadily right, letters ~30px tall over ~120px
    const abc: Array<[number, number]> = [];
    for (let i = 0; i <= 120; i++) {
      const x = i + 6 * Math.sin(i / 3);
      const y = 20 + 14 * Math.sin(i / 4) + (i % 40 < 20 ? -6 : 0);
      abc.push([x, y]);
    }
    expect(isScribble(pts(abc))).toBe(false);
    // A cursive "mmm" sweeps its short axis many times but moves forward
    const mmm = Array.from({ length: 150 }, (_, i) => [i * 1.5, 20 + 15 * Math.abs(Math.sin(i / 5))] as [number, number]);
    expect(isScribble(pts(mmm))).toBe(false);
  });

  it('erases strokes that touch the scribble box', () => {
    const box = boundsOf(pts(line(0, 0, 100, 40)));
    expect(strokeTouchesBox(pts(line(50, -50, 50, 200, 2)), box, 2)).toBe(true);
    expect(strokeTouchesBox(pts(line(300, 0, 400, 0)), box, 2)).toBe(false);
  });

  it('a short press that barely moves is a tap', () => {
    expect(isTap(120, pts([[10, 10], [12, 11]]))).toBe(true);
    expect(isTap(400, pts([[10, 10]]))).toBe(false);
    expect(isTap(120, pts([[10, 10], [40, 10]]))).toBe(false);
  });
});

describe('year detail', () => {
  const a = (questionId: string, isCorrect: boolean, timestamp: string, extra: Partial<AttemptRecord> = {}): AttemptRecord => ({
    questionId,
    topic: 'networking',
    selectedAnswer: 'a',
    isCorrect,
    timeSeconds: 30,
    confidence: 3,
    timestamp,
    ...extra,
  });

  it('counts the six panel stats', () => {
    const qs = [
      q({ id: 'A1', topics: ['networking'] }),
      q({ id: 'A2', topics: ['math'] }),
      q({ id: 'B1', paper: 'FE-B', topics: ['algorithms'] }),
    ];
    const attempts = [
      a('A1', false, '2026-01-01', { confidence: 5 }),
      a('A1', false, '2026-01-02'),
      a('A1', true, '2026-01-03'),
      a('A2', true, '2026-01-01', { timeSeconds: 90 }),
      a('A2', true, '2026-01-02'),
      a('Z9', false, '2026-01-01'),
    ];
    const d = computeYearDetail('2024', qs, attempts, 20);
    expect(d.overall).toMatchObject({ attempted: 2, total: 3, correct: 3, accuracy: 60, coverage: 67 });
    expect(d.papers.map((p) => p.label)).toEqual(['Subject A / AM', 'Subject B / PM']);
    expect(d.repeatTraps).toEqual([{ questionId: 'A1', wrong: 2, attempts: 3 }]);
    expect(d.weakestTopics[0]).toMatchObject({ topic: 'networking', accuracy: 33 });
    expect(d.avgSeconds).toBe(42);
    expect(d.fooled).toEqual({ wrong: 1, sure: 1 });
    expect(d.firstAttemptAccuracy).toBe(50);
    expect(d.latestAttemptAccuracy).toBe(100);
  });
});

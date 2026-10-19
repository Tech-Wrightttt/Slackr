/**
 * White-box tests: written against the source so each decision takes both outcomes ([branch]) and
 * otherwise-unreached statements run ([statement]). V8 coverage measures the result.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SRSEngine } from '../src/services/srsEngine';
import { computeMatchRanges, excerptAround, parseQuery } from '../src/services/searchEngine';
import { topicHue, topicStyle } from '../src/services/topicColors';
import type { QuestionData, SRScheduleRecord } from '../src/db/schema';

const T0 = new Date('2026-01-01T00:00:00Z');

const sched = (algorithm: SRScheduleRecord['algorithm'], extra: Partial<SRScheduleRecord> = {}): SRScheduleRecord => ({
  ...SRSEngine.getInitialSchedule('Q', algorithm),
  ...extra,
});

describe('[whitebox][branch] SRSEngine SM-2', () => {
  it.each([
    [0, 0, 1],
    [1, 1, 6],
    [2, 6, 16], // 6 x EF 2.6
  ])('repetition %i (interval %i) -> %i days', (n, interval, days) => {
    expect(SRSEngine.calculateNextReview(sched('SM-2', { repetitionNumber: n, intervalDays: interval }), true, 5, 30, 0.3, T0).intervalDays).toBe(days);
  });
  it('fail branch resets repetitions', () => {
    const next = SRSEngine.calculateNextReview(sched('SM-2', { repetitionNumber: 4, intervalDays: 30 }), false, 1, 30, 0.3, T0);
    expect([next.repetitionNumber, next.intervalDays]).toEqual([0, 1]);
  });
  it('easiness factor floor of 1.3', () => {
    expect(SRSEngine.calculateNextReview(sched('SM-2', { easinessFactor: 1.3 }), false, 5, 30, 0.3, T0).easinessFactor).toBe(1.3);
  });
  it('low-confidence correct answer still passes (grade 3)', () => {
    expect(SRSEngine.calculateNextReview(sched('SM-2'), true, 1, 30, 0.3, T0).repetitionNumber).toBe(1);
  });
});

describe('[whitebox][branch] SRSEngine FSRS', () => {
  it('first review with Easy rating uses the initial tables', () => {
    const next = SRSEngine.calculateNextReview(sched('FSRS'), true, 5, 30, 0.3, T0);
    expect([next.stability, next.difficulty, next.intervalDays, next.repetitionNumber]).toEqual([4.8, 3.5, 5, 1]);
  });
  it.each([
    // [isCorrect, confidence, stability, difficulty, interval]
    [true, 5, 38, 4.5, 38], // Easy: x3.8
    [true, 3, 24, 4.9, 24], // Good (grade 4): x2.4
    [true, 1, 24, 4.9, 24], // Good (grade 3): x2.4
    [false, 1, 12, 5.3, 12], // Hard (grade 2): x1.2
  ])('review correct=%s conf=%i', (ok, conf, s, d, i) => {
    const next = SRSEngine.calculateNextReview(sched('FSRS', { stability: 10, difficulty: 5, repetitionNumber: 2 }), ok, conf, 30, 0.3, T0);
    expect([next.stability, next.difficulty, next.intervalDays, next.repetitionNumber]).toEqual([s, d, i, 3]);
  });
  it('lapse (Again) cuts stability and resets repetitions', () => {
    const next = SRSEngine.calculateNextReview(sched('FSRS', { stability: 10, difficulty: 5, repetitionNumber: 2 }), false, 3, 30, 0.3, T0);
    expect([next.stability, next.difficulty, next.intervalDays, next.repetitionNumber]).toEqual([3, 5.8, 1, 0]);
  });
  it('[BVA] stability and difficulty clamps', () => {
    const lapse = SRSEngine.calculateNextReview(sched('FSRS', { stability: 1, difficulty: 9.9 }), false, 5, 30, 0.3, T0);
    expect([lapse.stability, lapse.difficulty]).toEqual([0.4, 10]);
    const easy = SRSEngine.calculateNextReview(sched('FSRS', { stability: 0.1, difficulty: 1.2 }), true, 5, 30, 0.3, T0);
    expect([easy.stability, easy.difficulty]).toEqual([1, 1]);
  });
});

describe('[whitebox][branch] SRSEngine Custom', () => {
  it.each([
    [0, 0, 1],
    [1, 1, 5],
    [2, 5, 13], // 5 x EF 2.5 = 12.5 -> 13
  ])('repetition %i (interval %i) -> %i days', (n, interval, days) => {
    expect(SRSEngine.calculateNextReview(sched('Custom', { repetitionNumber: n, intervalDays: interval }), true, 3, 30, 0.2, T0).intervalDays).toBe(days);
  });
  it('fast but wrong answers get no fluency bonus', () => {
    const next = SRSEngine.calculateNextReview(sched('Custom', { repetitionNumber: 3, intervalDays: 10 }), false, 2, 5, 0.2, T0);
    expect([next.repetitionNumber, next.intervalDays]).toEqual([0, 1]);
  });
  it.each([
    [true, 5, 2.6],
    [true, 3, 2.5],
    [true, 2, 2.36],
    [false, 5, 1.7],
    [false, 3, 1.96],
    [false, 2, 2.18],
  ])('grade branch correct=%s conf=%i -> EF %s', (ok, conf, ef) => {
    expect(SRSEngine.calculateNextReview(sched('Custom'), ok, conf, 30, 0.3, T0).easinessFactor).toBe(ef);
  });
});

describe('[whitebox][statement] SRSEngine defaults', () => {
  it('initial schedules set FSRS-only fields only for FSRS', () => {
    expect(SRSEngine.getInitialSchedule('Q', 'FSRS').difficulty).toBe(5);
    expect(SRSEngine.getInitialSchedule('Q', 'SM-2').difficulty).toBeUndefined();
  });
  it('default arguments run', () => {
    expect(SRSEngine.calculateNextReview(sched('Custom'), true).algorithm).toBe('Custom');
  });
  it('missing numeric fields fall back to defaults', () => {
    const bare = { questionId: 'Q', algorithm: 'SM-2', nextReviewDate: '' } as unknown as SRScheduleRecord;
    expect(SRSEngine.calculateNextReview(bare, true, 4, 30, 0.3, T0).easinessFactor).toBe(2.6);
  });
});

// ── QuestionsService ─────────────────────────────────────────────────────────

const q = (over: Partial<QuestionData>): QuestionData =>
  ({ id: 'x', year: '2024', season: 'S', paper: 'FE-A', number: 1, topics: [], question: '', options: {}, ...over }) as QuestionData;

const BANK: Record<string, QuestionData> = {
  '2024S_FE-A_2': q({ id: '2024S_FE-A_2', number: 2, topics: ['math'], session_id: '2024S_FE-A' }),
  '2024S_FE-A_1': q({ id: '2024S_FE-A_1', number: 1, topics: ['Networking'], session_id: '2024S_FE-A' }),
  '2024A_FE-B_1': q({ id: '2024A_FE-B_1', season: 'A', paper: 'FE-B', topics: ['math'], session_id: '2024A_FE-B' }),
  '2019A_FE_AM_5': q({ id: '2019A_FE_AM_5', year: '2019', season: 'A', paper: 'AM', number: 5, topics: ['networking'] }),
};

const response = (ok: boolean, body: unknown) => ({ ok, json: async () => body });

async function freshService(fetchImpl: (url: string) => Promise<unknown>) {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  return (await import('../src/services/questionsService')).QuestionsService;
}

describe('[whitebox][branch] QuestionsService.sortQuestionsStrict', () => {
  let sort: (list: QuestionData[]) => QuestionData[];
  beforeEach(async () => {
    sort = (await import('../src/services/questionsService')).QuestionsService.sortQuestionsStrict;
  });
  const ids = (list: QuestionData[]) => list.map((x) => x.id);

  it('year descending first (non-numeric year sorts last)', () => {
    expect(ids(sort([q({ id: 'old', year: '2019' }), q({ id: 'bad', year: 'n/a' }), q({ id: 'new', year: '2024' })]))).toEqual(['new', 'old', 'bad']);
  });
  it('precomputed sort_index wins when both present and different', () => {
    expect(ids(sort([q({ id: 'b', sort_index: 200, number: 1 }), q({ id: 'a', sort_index: 100, number: 9 })]))).toEqual(['a', 'b']);
  });
  it('fallback: Spring before Autumn', () => {
    expect(ids(sort([q({ id: 'A', season: 'A' }), q({ id: 'S', season: 'S' })]))).toEqual(['S', 'A']);
  });
  it('fallback: morning paper before afternoon', () => {
    expect(ids(sort([q({ id: 'pm', paper: 'PM' }), q({ id: 'am', paper: 'AM' })]))).toEqual(['am', 'pm']);
  });
  it('fallback: question number then sub-number (equal sort_index falls through)', () => {
    const list = [
      q({ id: '2.2', number: 2, sub_number: '2', sort_index: 5 }),
      q({ id: '2', number: 2, sort_index: 5 }),
      q({ id: '1', number: 1, sort_index: 5 }),
    ];
    expect(ids(sort(list))).toEqual(['1', '2', '2.2']);
  });
  it('does not mutate its input', () => {
    const list = [q({ id: 'b', number: 2 }), q({ id: 'a', number: 1 })];
    sort(list);
    expect(ids(list)).toEqual(['b', 'a']);
  });
});

describe('[whitebox][branch] QuestionsService loading', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('static bundle is used and cached', async () => {
    const svc = await freshService(async () => response(true, BANK));
    await svc.loadAllQuestions();
    await svc.loadAllQuestions();
    expect(Object.keys(await svc.loadAllQuestions())).toHaveLength(4);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('falls back to the API when the static bundle is missing', async () => {
    const svc = await freshService(async (url) =>
      url.startsWith('/data/') ? response(false, null) : response(true, { items: Object.values(BANK) })
    );
    expect(Object.keys(await svc.loadAllQuestions())).toHaveLength(4);
  });
  it('falls back to the API when the static fetch throws', async () => {
    const svc = await freshService(async (url) => {
      if (url.startsWith('/data/')) throw new Error('offline');
      return response(true, { items: [BANK['2024S_FE-A_1']] });
    });
    expect(Object.keys(await svc.loadAllQuestions())).toEqual(['2024S_FE-A_1']);
  });
  it('returns an empty bank when both sources fail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const svc = await freshService(async () => {
      throw new Error('offline');
    });
    expect(await svc.loadAllQuestions()).toEqual({});
  });
  it('returns an empty bank when the API answers not-ok', async () => {
    const svc = await freshService(async () => response(false, null));
    expect(await svc.loadAllQuestions()).toEqual({});
  });
});

describe('[whitebox][statement] QuestionsService queries', () => {
  afterEach(() => vi.unstubAllGlobals());
  const staticOnly = (url: string) => (url.endsWith('questions_index.json') ? response(true, BANK) : response(false, null));

  it('metadata from the bundle when present', async () => {
    const svc = await freshService(async (url) => (url.endsWith('metadata_summary.json') ? response(true, { total_questions: 9 }) : response(true, BANK)));
    expect((await svc.loadMetadataSummary()).total_questions).toBe(9);
    expect((await svc.loadMetadataSummary()).total_questions).toBe(9);
  });
  it('metadata computed from questions when the bundle is missing', async () => {
    const svc = await freshService(async (url) => staticOnly(url));
    const meta = await svc.loadMetadataSummary();
    expect([meta.total_questions, meta.years, meta.year_counts['2024']]).toEqual([4, ['2024', '2019'], 3]);
  });
  it('metadata computed when the bundle fetch throws', async () => {
    const svc = await freshService(async (url) => {
      if (url.endsWith('metadata_summary.json')) throw new Error('x');
      return response(true, BANK);
    });
    expect((await svc.loadMetadataSummary()).topics).toEqual(['Networking', 'math', 'networking']);
  });
  it('sessions from metadata when listed', async () => {
    const sessions = [{ session_id: 's' }];
    const svc = await freshService(async (url) =>
      url.endsWith('metadata_summary.json') ? response(true, { sessions_by_year: { '2024': sessions } }) : response(true, BANK)
    );
    expect(await svc.getSessionsForYear('2024')).toEqual(sessions);
  });
  it('sessions derived from questions otherwise, Spring/morning first', async () => {
    const svc = await freshService(async (url) => staticOnly(url));
    const sessions = await svc.getSessionsForYear('2024');
    expect(sessions.map((s) => [s.session_id, s.question_count, s.first_q, s.last_q])).toEqual([
      ['2024S_FE-A', 2, 1, 2],
      ['2024A_FE-B', 1, 1, 1],
    ]);
    expect((await svc.getSessionsForYear('2019'))[0]!.session_id).toBe('2019A_AM');
  });
  it('by year, with and without a session filter', async () => {
    const svc = await freshService(async (url) => staticOnly(url));
    expect((await svc.getQuestionsByYear('2024')).map((x) => x.id)).toEqual(['2024S_FE-A_1', '2024S_FE-A_2', '2024A_FE-B_1']);
    expect(await svc.getQuestionsByYear('2024', '2024A_FE-B')).toHaveLength(1);
    expect(await svc.getQuestionsByYear('2024', 'all')).toHaveLength(3);
  });
  it('by topic is case-insensitive and can filter by year', async () => {
    const svc = await freshService(async (url) => staticOnly(url));
    expect(await svc.getQuestionsByTopic('NETWORKING')).toHaveLength(2);
    expect(await svc.getQuestionsByTopic('networking', '2019')).toHaveLength(1);
    expect(await svc.getQuestionsByTopic('networking', 'all')).toHaveLength(2);
  });
  it('combined filters, by id and custom lists', async () => {
    const svc = await freshService(async (url) => staticOnly(url));
    expect(await svc.getQuestionsCombined()).toHaveLength(4);
    expect(await svc.getQuestionsCombined('2024', 'math')).toHaveLength(2);
    expect(await svc.getQuestionsCombined('all', 'all')).toHaveLength(4);
    expect((await svc.getQuestionById('2019A_FE_AM_5'))?.number).toBe(5);
    expect(await svc.getQuestionById('nope')).toBeNull();
    expect((await svc.getCustomQuestions(['2019A_FE_AM_5', 'nope', '2024S_FE-A_1'])).map((x) => x.id)).toEqual(['2024S_FE-A_1', '2019A_FE_AM_5']);
  });
});

// ── Search highlighting ──────────────────────────────────────────────────────

describe('[whitebox][branch] computeMatchRanges', () => {
  it('empty text or empty query', () => {
    expect(computeMatchRanges('', parseQuery('x'))).toEqual([]);
    expect(computeMatchRanges('abc', parseQuery(''))).toEqual([]);
  });
  it('term mode: every occurrence, adjacent ranges stay separate', () => {
    expect(computeMatchRanges('Hash and hash table', parseQuery('hash table'))).toEqual([
      { start: 0, end: 4 },
      { start: 9, end: 13 },
      { start: 14, end: 19 },
    ]);
  });
  it('phrase mode: overlapping ranges merge', () => {
    expect(computeMatchRanges('Hash and hash table', parseQuery('"hash table" table'))).toEqual([{ start: 9, end: 19 }]);
  });
  it('paste mode: runs of shared word pairs', () => {
    expect(computeMatchRanges('A binary search tree is', parseQuery('Please define a binary search tree in detail.'))).toEqual([{ start: 2, end: 20 }]);
  });
});

describe('[whitebox][branch] excerptAround', () => {
  const text = 'x'.repeat(50) + ' target ' + 'y'.repeat(50);
  it('short text is returned whole', () => {
    expect(excerptAround('short', [], 10)).toEqual({ text: 'short', ranges: [] });
  });
  it('window snaps to a word start and adds ellipses on both sides', () => {
    expect(excerptAround(text, [{ start: 51, end: 57 }], 10)).toEqual({
      text: '…target ' + 'y'.repeat(13) + '…',
      ranges: [{ start: 1, end: 7 }],
    });
  });
  it('no match keeps the start and drops out-of-window ranges', () => {
    const out = excerptAround(text, [], 10);
    expect([out.text.length, out.text.endsWith('…'), out.text.startsWith('…')]).toEqual([21, true, false]);
  });
});

describe('[whitebox][branch] topicHue', () => {
  it('registered topics cycle the palette in order', () => {
    expect(topicHue('accounting')).toBe('#4F8F2A');
    expect(topicHue('algorithms')).toBe('#2F8F8F');
  });
  it('unregistered topics hash to a stable palette colour', () => {
    expect(topicHue('made-up-topic')).toMatch(/^#[0-9A-F]{6}$/);
    expect(topicHue('made-up-topic')).toBe(topicHue('made-up-topic'));
  });
  it('[statement] topicStyle sets --topic', () => {
    expect(topicStyle('accounting')).toEqual({ '--topic': '#4F8F2A' });
  });
});

/**
 * Black-box tests: written from each function's documented contract.
 * Describe titles carry technique tags ([blackbox], [EP], [BVA]) that the PDF report groups by.
 */
import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from '../src/services/passwordPolicy';
import { SRSEngine } from '../src/services/srsEngine';
import { parseQuery, searchQuestions, toPlainText } from '../src/services/searchEngine';
import { topicLabel } from '../src/services/topicColors';
import type { QuestionData } from '../src/db/schema';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('[blackbox][EP] passwordProblem partitions', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordProblem('Tr0ub4dor&3x', 'jairus')).toBeNull();
  });
  it.each([
    ['ALLUPPER1!', 'lowercase letter'],
    ['alllower1!', 'uppercase letter'],
    ['NoDigitsHere!', 'number'],
    ['NoSymbols123', 'symbol'],
  ])('names the missing class for %s', (pw, missing) => {
    expect(passwordProblem(pw)).toContain(missing);
  });
  it('refuses a password containing the username', () => {
    expect(passwordProblem('Xjairus#9Q', 'Jairus')).toContain('username');
  });
  it('refuses a common word', () => {
    expect(passwordProblem('MyQwerty#99')).toContain('too easy');
  });
  it('refuses an over-long password', () => {
    expect(passwordProblem('Aa1!'.repeat(40))).toContain('at most');
  });
});

describe('[blackbox][BVA] passwordProblem boundaries', () => {
  const make = (n: number) => ('Aa1!' + 'x'.repeat(n)).slice(0, n);
  it.each([
    [PASSWORD_MIN - 1, false],
    [PASSWORD_MIN, true],
    [PASSWORD_MIN + 1, true],
    [PASSWORD_MAX - 1, true],
    [PASSWORD_MAX, true],
    [PASSWORD_MAX + 1, false],
  ])('length %i accepted = %s', (n, ok) => {
    expect(passwordProblem(make(n)) === null).toBe(ok);
  });
  it.each([
    ['ab', false],
    ['abc', true],
  ])('username "%s" checked = %s', (name, refused) => {
    expect(passwordProblem('Zabc#77Kq', name) !== null).toBe(refused);
  });
});

describe('[blackbox][EP] SRSEngine correctness partitions', () => {
  it.each(['SM-2', 'FSRS', 'Custom'] as const)('%s: a wrong answer schedules for tomorrow', (algo) => {
    const next = SRSEngine.calculateNextReview(SRSEngine.getInitialSchedule('Q', algo), false, 3, 30, 0.3, T0);
    expect(next.intervalDays).toBe(1);
    expect(next.nextReviewDate).toBe('2026-01-02T00:00:00.000Z');
  });
  it.each(['SM-2', 'FSRS', 'Custom'] as const)('%s: keeps the algorithm and question id', (algo) => {
    const next = SRSEngine.calculateNextReview(SRSEngine.getInitialSchedule('Q9', algo), true, 4, 30, 0.3, T0);
    expect([next.algorithm, next.questionId]).toEqual([algo, 'Q9']);
  });
});

describe('[blackbox][BVA] SRSEngine Custom time and topic boundaries', () => {
  const second = { ...SRSEngine.getInitialSchedule('Q', 'Custom'), repetitionNumber: 1 };
  it.each([
    [24.9, 6], // 5 x 1.0 topic x 1.10 fluent = 5.5 -> 6
    [25, 5],
    [90, 5],
    [90.1, 4], // 5 x 0.85 = 4.25 -> 4
  ])('time %ss gives %i days', (t, days) => {
    expect(SRSEngine.calculateNextReview(second, true, 3, t, 0.2, T0).intervalDays).toBe(days);
  });
  it.each([
    [0.0, 6], // factor 1.2
    [0.6, 3], // factor 0.6
    [0.9, 3], // clamped to 0.6
  ])('topic error %s gives %i days', (rate, days) => {
    expect(SRSEngine.calculateNextReview(second, true, 3, 30, rate, T0).intervalDays).toBe(days);
  });
});

describe('[blackbox][EP] parseQuery query shapes', () => {
  it('empty input is empty', () => {
    expect(parseQuery('   ').isEmpty).toBe(true);
  });
  it('loose terms are split and trimmed of punctuation', () => {
    expect(parseQuery('hash, table!').looseTerms).toEqual(['hash', 'table']);
  });
  it('quoted text becomes an exact phrase (smart quotes too)', () => {
    const p = parseQuery('“binary search tree” cost');
    expect([p.exactPhrases, p.looseTerms]).toEqual([['binary search tree'], ['cost']]);
  });
  it('long punctuated text is a pasted question', () => {
    expect(parseQuery('Which of the following is the correct description of a stack?').isPastedQuestion).toBe(true);
  });
});

describe('[blackbox][BVA] parseQuery paste thresholds', () => {
  const words = (n: number, pad: number) => Array.from({ length: n }, (_, i) => 'w' + 'x'.repeat(pad) + i).join(' ');
  it('39 characters is not a paste', () => {
    const q = 'a'.repeat(35) + ' b c d e f g'.slice(0, 4);
    expect(q.length).toBe(39);
    expect(parseQuery(q).isPastedQuestion).toBe(false);
  });
  it('6 words is not a paste even when long', () => {
    expect(parseQuery(words(6, 8)).isPastedQuestion).toBe(false);
  });
  it('7 words and 40+ characters is a paste', () => {
    const q = words(7, 5);
    expect(q.length).toBeGreaterThanOrEqual(40);
    expect(parseQuery(q).isPastedQuestion).toBe(true);
  });
});

describe('[blackbox][EP] searchQuestions', () => {
  const q = (id: string, question: string, extra: Partial<QuestionData> = {}) =>
    ({ id, question, options: {}, explanation: '', topics: [], ...extra }) as unknown as QuestionData;
  const bank = [
    q('A', 'What is a hash table?', { explanation: 'Uses buckets.' }),
    q('B', 'Define a binary search tree.', { options: { a: 'hash map' } }),
    q('C', 'Name a sorting algorithm.', { topics: ['algorithms'] }),
  ];
  it('empty query returns everything', () => {
    expect(searchQuestions(bank, parseQuery(''))).toHaveLength(3);
  });
  it('question-stem hits rank before option hits', () => {
    expect(searchQuestions(bank, parseQuery('hash')).map((m) => [m.question.id, m.field])).toEqual([
      ['A', 'question'],
      ['B', 'option'],
    ]);
  });
  it('every term must match', () => {
    expect(searchQuestions(bank, parseQuery('hash buckets')).map((m) => m.question.id)).toEqual(['A']);
  });
  it('topic labels match loose terms', () => {
    expect(searchQuestions(bank, parseQuery('algorithms'))[0]!.field).toBe('topic');
  });
  it('no match returns nothing', () => {
    expect(searchQuestions(bank, parseQuery('zebra'))).toEqual([]);
  });
  it('a pasted question finds its source', () => {
    const res = searchQuestions(bank, parseQuery('Please define a binary search tree in detail.'));
    expect(res[0]!.question.id).toBe('B');
  });
});

describe('[blackbox][EP] text helpers', () => {
  it('toPlainText strips markdown and embeds', () => {
    expect(toPlainText('# Title\n**bold** ![[img.png]] [[Page|label]] <b>x</b>')).toBe('Title bold label x');
  });
  it('toPlainText of null is empty', () => {
    expect(toPlainText(null)).toBe('');
  });
  it('topicLabel title-cases and upper-cases short words', () => {
    expect(topicLabel('object-oriented-programming')).toBe('Object Oriented Programming');
    expect(topicLabel('ai-it')).toBe('AI It');
  });
});

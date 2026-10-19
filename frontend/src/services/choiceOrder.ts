import type { QuestionData } from '../db/schema';

/** Letters a question offers, in their original order */
export const choiceKeys = (q: QuestionData): string[] => {
  const keys = q.options && Object.keys(q.options).length > 0 ? Object.keys(q.options) : q.fallback_choices || [];
  return keys.length > 0 ? keys : ['a', 'b', 'c', 'd'];
};

// Choices that point at other choices or at their own position break when reordered
const POSITIONAL = [
  /\b(all|none) of the (above|following|preceding)\b/i,
  /\bboth\b.*\band\b/i,
  /\bneither\b.*\bnor\b/i,
  /^\s*\(?[a-h]\)?\s*(,|and|or|&)\s*\(?[a-h]\)?\b/i,
  /\b(options?|choices?|answers?)\s+\(?[a-h]\)?\b/i,
  /\bonly\s+\(?[a-h]\)/i,
];

/** True when shuffling would change the meaning or the choices live in an image */
export const isPositional = (q: QuestionData): boolean => {
  const texts = Object.values(q.options || {});
  if (texts.length < 2 || q.blanks?.length) return true;
  return texts.some((t) => !t?.trim() || t.includes('![') || POSITIONAL.some((re) => re.test(t)));
};

const hashSeed = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Deterministic Fisher-Yates (mulberry32), so a seed always gives the same order */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let a = hashSeed(seed);
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Original choice keys in display order. With a seed and a shuffleable question the order is a
 * stable shuffle (same seed, same order); otherwise it is the original order.
 */
export const displayOrder = (q: QuestionData, seed: string | null): string[] => {
  const keys = choiceKeys(q);
  return seed && !isPositional(q) ? seededShuffle(keys, `${seed}:${q.id}`) : keys;
};

/** Whether an original choice key is the correct one (handles "c) text" style keys) */
export const isCorrectKey = (q: QuestionData, key: string): boolean => {
  const correct = (q.correct || '').trim().toLowerCase();
  const k = key.trim().toLowerCase();
  return correct === k || correct.startsWith(`${k})`) || correct.startsWith(`${k}.`);
};

/** One letter per blank, in the card's blank order */
export type BlankPicks = Record<string, string>;

export const isBlanksCorrect = (q: QuestionData, picks: BlankPicks): boolean =>
  !!q.blanks?.length && q.blanks.every((b) => picks[b.label] === b.correct);

/** Stored form of a blank answer, matching the index's `correct` string ("A=c, B=e") */
export const formatBlankPicks = (q: QuestionData, picks: BlankPicks): string =>
  (q.blanks || []).map((b) => `${b.label}=${picks[b.label] ?? '-'}`).join(', ');

export const parseBlankPicks = (answer: string): BlankPicks => {
  const out: BlankPicks = {};
  for (const part of answer.split(',')) {
    const [label, letter] = part.split('=').map((s) => s.trim());
    if (label && letter && letter !== '-') out[label] = letter;
  }
  return out;
};

/**
 * A question no pick can be marked right on: the answer key is an image or free text in the vault
 * (see backend/scripts/audit_index.py). The card falls back to self-grading for these.
 */
export const isSelfGraded = (q: QuestionData): boolean =>
  !q.blanks?.length && (q.correct || '').trim().length !== 1 && !/^[a-j][).]/i.test((q.correct || '').trim());

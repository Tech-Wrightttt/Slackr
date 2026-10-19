import type { QuestionData } from '../db/schema';

/**
 * Scores for a finished set.
 *
 * Accuracy divides by every question in the set, as the real exam does: a skipped question counts
 * as wrong, so skipping hard ones can no longer raise the score.
 *
 * The mock score estimates the official 1000-point scale (600 passes). The official per-question
 * weights are not published, so each question carries a build-time pseudo-weight (`weight_tier`,
 * see backend/parsers/question_classifier.py): 3 for Subject B / PM and code-heavy questions,
 * 2 for other calculations, 1 for recall. Each paper is normalized to 1000 on its own.
 */

export const PASS_LINE = 1000 * 0.6;

export const accuracyOfTotal = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : 0);

const tierOf = (q: QuestionData) => q.weight_tier ?? 1;

const paperKey = (q: QuestionData) => q.session_id || `${q.year}${q.season}_${q.paper}`;

export interface PaperScore {
  paper: string;
  score: number;
  total: number;
}

export interface MockScore {
  /** Estimated score out of 1000: the mean of the per-paper scores */
  score: number;
  passed: boolean;
  papers: PaperScore[];
}

export function mockScore(questions: QuestionData[], correctIds: ReadonlySet<string>): MockScore {
  const byPaper = new Map<string, QuestionData[]>();
  for (const q of questions) {
    const key = paperKey(q);
    const list = byPaper.get(key);
    if (list) list.push(q);
    else byPaper.set(key, [q]);
  }
  const papers: PaperScore[] = [];
  for (const [paper, list] of byPaper) {
    let earned = 0;
    let possible = 0;
    for (const q of list) {
      possible += tierOf(q);
      if (correctIds.has(q.id)) earned += tierOf(q);
    }
    papers.push({ paper, score: possible ? Math.round((earned / possible) * 1000) : 0, total: list.length });
  }
  const score = papers.length ? Math.round(papers.reduce((s, p) => s + p.score, 0) / papers.length) : 0;
  return { score, passed: score >= PASS_LINE, papers };
}

// Current Subject A sitting: 60 questions in 90 minutes (ITPEC FE since 2023)
export const MOCK_PAPER_SIZE = 60;
export const MOCK_PAPER_MINUTES = 90;

/**
 * A random Subject A style paper whose tier mix matches the real papers: questions are drawn per
 * weight tier in the same proportions as the FE-A / AM pool, then put in exam order.
 */
export function buildMockPaper(
  pool: QuestionData[],
  rand: () => number = Math.random,
  size = MOCK_PAPER_SIZE
): QuestionData[] {
  const eligible = pool.filter((q) => (q.paper === 'FE-A' || q.paper === 'AM') && !q.blanks?.length);
  const tiers = new Map<number, QuestionData[]>();
  for (const q of eligible) {
    const t = tierOf(q);
    const list = tiers.get(t);
    if (list) list.push(q);
    else tiers.set(t, [q]);
  }
  const picked: QuestionData[] = [];
  const order = [...tiers.keys()].sort();
  let remaining = Math.min(size, eligible.length);
  order.forEach((tier, i) => {
    const list = tiers.get(tier)!;
    const want = i === order.length - 1 ? remaining : Math.round((list.length / eligible.length) * size);
    const take = Math.min(want, list.length, remaining);
    const shuffled = list.slice();
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(rand() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k]!, shuffled[j]!];
    }
    picked.push(...shuffled.slice(0, take));
    remaining -= take;
  });
  // Exam order: recall and calculation questions interleave as on a real paper, by number
  return picked.sort((a, b) => (a.number || 0) - (b.number || 0) || a.id.localeCompare(b.id));
}

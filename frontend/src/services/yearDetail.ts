import type { AttemptRecord, QuestionData } from '../db/schema';

/** High-confidence answers (level 4-5) that ended wrong count as "fooled" */
const SURE = 4;
/** A topic needs this many attempts in the year before it can rank as weak */
const MIN_TOPIC_ATTEMPTS = 2;

export interface PaperSplit {
  label: string;
  total: number;
  attempted: number;
  correct: number;
  /** correct / attempts */
  accuracy: number;
  /** attempted questions / questions in the paper */
  coverage: number;
}

export interface YearDetail {
  year: string;
  overall: PaperSplit;
  papers: PaperSplit[];
  /** Questions answered wrong at least twice */
  repeatTraps: Array<{ questionId: string; wrong: number; attempts: number }>;
  weakestTopics: Array<{ topic: string; accuracy: number; attempts: number }>;
  avgSeconds: number | null;
  overallAvgSeconds: number | null;
  fooled: { wrong: number; sure: number };
  /** First attempt vs latest attempt on each question tried in this year */
  firstAttemptAccuracy: number | null;
  latestAttemptAccuracy: number | null;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const isSubjectB = (q: QuestionData) => q.paper === 'FE-B' || q.paper === 'PM';

const split = (label: string, qs: QuestionData[], attempts: AttemptRecord[]): PaperSplit => {
  const ids = new Set(qs.map((q) => q.id));
  const mine = attempts.filter((a) => ids.has(a.questionId));
  const attempted = new Set(mine.map((a) => a.questionId)).size;
  const correct = mine.filter((a) => a.isCorrect).length;
  return { label, total: qs.length, attempted, correct, accuracy: pct(correct, mine.length), coverage: pct(attempted, qs.length) };
};

/**
 * Everything the year panel shows, from the year's questions and the attempts on them.
 * `overallAvgSeconds` is the average time per attempt across every year, for comparison.
 */
export function computeYearDetail(
  year: string,
  questions: QuestionData[],
  attempts: AttemptRecord[],
  overallAvgSeconds: number | null
): YearDetail {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const mine = attempts.filter((a) => byId.has(a.questionId));

  const perQuestion = new Map<string, AttemptRecord[]>();
  for (const a of mine) {
    const list = perQuestion.get(a.questionId);
    if (list) list.push(a);
    else perQuestion.set(a.questionId, [a]);
  }

  const repeatTraps = [...perQuestion]
    .map(([questionId, list]) => ({ questionId, wrong: list.filter((a) => !a.isCorrect).length, attempts: list.length }))
    .filter((t) => t.wrong >= 2)
    .sort((a, b) => b.wrong - a.wrong || a.questionId.localeCompare(b.questionId));

  const topics = new Map<string, { correct: number; attempts: number }>();
  for (const a of mine) {
    const topic = byId.get(a.questionId)?.topics?.[0] || a.topic;
    const t = topics.get(topic) ?? { correct: 0, attempts: 0 };
    t.attempts += 1;
    if (a.isCorrect) t.correct += 1;
    topics.set(topic, t);
  }
  const weakestTopics = [...topics]
    .filter(([, t]) => t.attempts >= MIN_TOPIC_ATTEMPTS)
    .map(([topic, t]) => ({ topic, accuracy: pct(t.correct, t.attempts), attempts: t.attempts }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 3);

  const sure = mine.filter((a) => (a.confidence ?? 0) >= SURE);

  let firstCorrect = 0;
  let latestCorrect = 0;
  for (const list of perQuestion.values()) {
    const sorted = list.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sorted[0]!.isCorrect) firstCorrect += 1;
    if (sorted[sorted.length - 1]!.isCorrect) latestCorrect += 1;
  }
  const tried = perQuestion.size;

  const subjectA = questions.filter((q) => !isSubjectB(q));
  const subjectB = questions.filter(isSubjectB);

  return {
    year,
    overall: split('All papers', questions, mine),
    papers: [
      ...(subjectA.length ? [split('Subject A / AM', subjectA, mine)] : []),
      ...(subjectB.length ? [split('Subject B / PM', subjectB, mine)] : []),
    ],
    repeatTraps,
    weakestTopics,
    avgSeconds: mine.length ? mine.reduce((s, a) => s + (a.timeSeconds || 0), 0) / mine.length : null,
    overallAvgSeconds,
    fooled: { wrong: sure.filter((a) => !a.isCorrect).length, sure: sure.length },
    firstAttemptAccuracy: tried ? pct(firstCorrect, tried) : null,
    latestAttemptAccuracy: tried ? pct(latestCorrect, tried) : null,
  };
}

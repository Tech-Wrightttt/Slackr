import type { QuestionData, SessionQuestionLog } from '../db/schema';
import { accuracyOfTotal, mockScore, type MockScore } from './scoring';

/** Answered faster than this and wrong counts as rushed */
export const RUSHED_SECONDS = 20;
/** Confidence at or above this level that ends wrong counts as fooled */
export const HIGH_CONFIDENCE = 4;

export interface TimedEntry {
  questionId: string;
  timeSeconds: number;
  isCorrect: boolean | null;
  rushed: boolean;
}

export interface SessionReportData {
  total: number;
  answered: number;
  correct: number;
  skipped: number;
  /** Correct over every question in the set (skips count as wrong) */
  accuracy: number;
  mock: MockScore | null;
  totalSeconds: number;
  averageSeconds: number;
  slowest: TimedEntry[];
  fastest: TimedEntry[];
  skippedIds: string[];
  flaggedIds: string[];
  switchedToRight: string[];
  switchedAwayFromRight: string[];
  unsureWrong: string[];
  byTopic: Array<{ topic: string; correct: number; total: number; accuracy: number }>;
  /** Wrong answers given at high confidence, over all high-confidence answers */
  fooled: { wrong: number; total: number };
  firstHalfAccuracy: number;
  secondHalfAccuracy: number;
  /** Share of the session's time spent on questions that ended wrong */
  timeOnWrongShare: number;
  /** Accuracy change against the previous session on the same set, if any */
  previousAccuracy: number | null;
  /** Wrong and skipped, for "Review mistakes" */
  reviewIds: string[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function buildSessionReport(
  log: SessionQuestionLog[],
  questions: Record<string, QuestionData>,
  options: { withMockScore?: boolean; previous?: SessionQuestionLog[] | null } = {}
): SessionReportData {
  const total = log.length;
  const answeredLog = log.filter((l) => l.finalChoice !== null);
  const correct = log.filter((l) => l.isCorrect === true).length;
  const totalSeconds = log.reduce((s, l) => s + l.timeSeconds, 0);

  const timed: TimedEntry[] = answeredLog.map((l) => ({
    questionId: l.questionId,
    timeSeconds: l.timeSeconds,
    isCorrect: l.isCorrect,
    rushed: l.isCorrect === false && l.timeSeconds < RUSHED_SECONDS,
  }));
  const bySpeed = timed.slice().sort((a, b) => a.timeSeconds - b.timeSeconds);

  const topicMap = new Map<string, { correct: number; total: number }>();
  for (const l of log) {
    const topic = questions[l.questionId]?.topics?.[0] || 'software';
    const t = topicMap.get(topic) ?? { correct: 0, total: 0 };
    t.total += 1;
    if (l.isCorrect) t.correct += 1;
    topicMap.set(topic, t);
  }

  const confident = answeredLog.filter((l) => (l.confidence ?? 0) >= HIGH_CONFIDENCE);
  const half = Math.ceil(total / 2);
  const firstHalf = log.slice(0, half);
  const secondHalf = log.slice(half);
  const wrongSeconds = log.filter((l) => l.isCorrect === false).reduce((s, l) => s + l.timeSeconds, 0);
  const unsure = answeredLog.filter((l) => l.choiceSwitches >= 2);

  const qs = log.map((l) => questions[l.questionId]).filter((q): q is QuestionData => !!q);
  const correctIds = new Set(log.filter((l) => l.isCorrect).map((l) => l.questionId));

  const previous = options.previous;
  const previousAccuracy =
    previous && previous.length ? accuracyOfTotal(previous.filter((l) => l.isCorrect).length, previous.length) : null;

  return {
    total,
    answered: answeredLog.length,
    correct,
    skipped: total - answeredLog.length,
    accuracy: accuracyOfTotal(correct, total),
    mock: options.withMockScore && qs.length ? mockScore(qs, correctIds) : null,
    totalSeconds,
    averageSeconds: answeredLog.length ? totalSeconds / answeredLog.length : 0,
    slowest: bySpeed.slice().reverse().slice(0, 5),
    fastest: bySpeed.slice(0, 5),
    skippedIds: log.filter((l) => l.finalChoice === null).map((l) => l.questionId),
    flaggedIds: log.filter((l) => l.flagged).map((l) => l.questionId),
    switchedToRight: unsure.filter((l) => l.isCorrect).map((l) => l.questionId),
    switchedAwayFromRight: unsure.filter((l) => !l.isCorrect && l.touchedCorrect).map((l) => l.questionId),
    unsureWrong: unsure.filter((l) => !l.isCorrect && !l.touchedCorrect).map((l) => l.questionId),
    byTopic: [...topicMap]
      .map(([topic, t]) => ({ topic, ...t, accuracy: pct(t.correct, t.total) }))
      .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total),
    fooled: { wrong: confident.filter((l) => l.isCorrect === false).length, total: confident.length },
    firstHalfAccuracy: pct(firstHalf.filter((l) => l.isCorrect).length, firstHalf.length),
    secondHalfAccuracy: pct(secondHalf.filter((l) => l.isCorrect).length, secondHalf.length),
    timeOnWrongShare: totalSeconds > 0 ? wrongSeconds / totalSeconds : 0,
    previousAccuracy,
    reviewIds: log.filter((l) => l.isCorrect !== true).map((l) => l.questionId),
  };
}

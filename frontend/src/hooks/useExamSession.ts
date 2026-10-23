import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuestionData, SessionQuestionLog, SessionRecord } from '../db/schema';
import { StatsDbService } from '../services/statsDb';
import { ExamService, type ExamAnswer, type ExamProgress, type ExamSetSpec } from '../services/examService';
import { elapsedMs, isExpired, isPaused, pauseClock, remainingMs, resumeClock, startClock } from '../services/examClock';

export type ExamStatus = 'idle' | 'running' | 'paused' | 'submitted';

export interface ExamResult {
  session: SessionRecord;
  sessionId: number;
}

/** Turns the saved answers into the per-question log the report and the sessions table use */
export const examLog = (progress: ExamProgress): SessionQuestionLog[] =>
  progress.spec.questionIds.map((id) => {
    const a = progress.answers[id];
    return {
      questionId: id,
      timeSeconds: a?.timeSeconds ?? 0,
      finalChoice: a?.choice ?? null,
      isCorrect: a && a.choice !== null ? a.isCorrect ?? false : null,
      choiceSwitches: a?.choiceSwitches ?? 0,
      touchedCorrect: a?.touchedCorrect ?? false,
      flagged: a?.flagged ?? false,
      confidence: a?.confidence,
    };
  });

/** Adds time spent on a question to its entry, creating an unanswered one if needed */
const withTime = (answers: Record<string, ExamAnswer>, id: string, ms: number): Record<string, ExamAnswer> => {
  const prev = answers[id] ?? { choice: null, flagged: false, timeSeconds: 0, choiceSwitches: 0, touchedCorrect: false };
  return { ...answers, [id]: { ...prev, timeSeconds: prev.timeSeconds + Math.max(0, ms) / 1000 } };
};

/**
 * One timed exam. The countdown is wall-clock based (see examClock), progress is written to
 * IndexedDB on every change so a reload resumes where it was, and time running out submits.
 */
export function useExamSession(questionsById: Record<string, QuestionData>) {
  const [progress, setProgress] = useState<ExamProgress | null>(null);
  const [status, setStatus] = useState<ExamStatus>('idle');
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<ExamResult | null>(null);
  const submittingRef = useRef(false);

  const commit = useCallback((next: ExamProgress) => {
    setProgress(next);
    setStatus(isPaused(next.clock) ? 'paused' : 'running');
    void ExamService.saveProgress(next);
  }, []);

  const start = useCallback(
    (spec: ExamSetSpec) => {
      const t = Date.now();
      commit({
        spec,
        index: 0,
        answers: {},
        clock: startClock(spec.minutes * 60_000, t),
        questionOpenedAtMs: 0,
        pauseCount: 0,
        startedAt: new Date(t).toISOString(),
      });
      setNow(t);
    },
    [commit]
  );

  const resume = useCallback(
    (saved: ExamProgress) => {
      setProgress(saved);
      setStatus(isPaused(saved.clock) ? 'paused' : 'running');
      setNow(Date.now());
    },
    []
  );

  const submit = useCallback(
    async (p: ExamProgress) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        const t = Date.now();
        const clock = pauseClock(p.clock, t);
        // The open question keeps its pick (if any) and the time spent on it this visit
        const openId = p.spec.questionIds[p.index];
        const answers = openId ? withTime(p.answers, openId, elapsedMs(clock, t) - p.questionOpenedAtMs) : p.answers;
        const final: ExamProgress = { ...p, answers, clock };

        // Exam answers count fully in stats and SRS, marked as exam attempts
        for (const id of p.spec.questionIds) {
          const a = answers[id];
          const q = questionsById[id];
          if (!a || a.choice === null || !q) continue;
          await StatsDbService.recordAttempt(id, q.topics?.[0] || 'software', a.choice, !!a.isCorrect, a.timeSeconds, a.confidence ?? 3, {
            choiceSwitches: a.choiceSwitches,
            mode: 'exam',
          });
        }

        const log = examLog(final);
        const session: SessionRecord = {
          sessionType: p.spec.sessionType,
          filterKey: p.spec.filterKey,
          totalQuestions: log.length,
          answeredQuestions: log.filter((l) => l.finalChoice !== null).length,
          correctAnswers: log.filter((l) => l.isCorrect).length,
          startedAt: p.startedAt,
          completedAt: new Date(t).toISOString(),
          isCompleted: true,
          mode: 'exam',
          title: p.spec.title,
          questionIds: p.spec.questionIds,
          log,
          pauseCount: p.pauseCount,
        };
        const sessionId = await StatsDbService.saveCompletedSession(session);
        await ExamService.lockSet(p.spec.setKey, p.spec.title, sessionId);
        await ExamService.clearProgress();
        setProgress(final);
        setResult({ session: { ...session, id: sessionId }, sessionId });
        setStatus('submitted');
      } finally {
        submittingRef.current = false;
      }
    },
    [questionsById]
  );

  // One ticking source for the display; the time itself always comes from the clock
  useEffect(() => {
    if (status !== 'running' || !progress) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (isExpired(progress.clock, t)) void submit(progress);
    }, 500);
    return () => clearInterval(id);
  }, [status, progress, submit]);

  /** Opens another question, like the real exam: any order, any number of times until submitting */
  const goTo = useCallback(
    (index: number) => {
      if (!progress || status !== 'running') return;
      if (index < 0 || index >= progress.spec.questionIds.length || index === progress.index) return;
      const used = elapsedMs(progress.clock, Date.now());
      const id = progress.spec.questionIds[progress.index]!;
      commit({
        ...progress,
        answers: withTime(progress.answers, id, used - progress.questionOpenedAtMs),
        index,
        questionOpenedAtMs: used,
      });
    },
    [progress, status, commit]
  );

  /** Saves (or changes) the pick for the open question, then opens the next one; the last stays open */
  const answer = useCallback(
    (entry: Omit<ExamAnswer, 'timeSeconds' | 'flagged'>) => {
      if (!progress || status !== 'running') return;
      const used = elapsedMs(progress.clock, Date.now());
      const id = progress.spec.questionIds[progress.index]!;
      const timed = withTime(progress.answers, id, used - progress.questionOpenedAtMs);
      const prev = timed[id]!;
      const last = progress.index + 1 >= progress.spec.questionIds.length;
      commit({
        ...progress,
        answers: {
          ...timed,
          [id]: {
            choice: entry.choice,
            choiceSwitches: entry.choiceSwitches,
            touchedCorrect: entry.touchedCorrect,
            confidence: entry.confidence,
            isCorrect: entry.isCorrect,
            flagged: prev.flagged,
            timeSeconds: prev.timeSeconds,
          },
        },
        index: last ? progress.index : progress.index + 1,
        questionOpenedAtMs: used,
      });
    },
    [progress, status, commit]
  );

  const toggleFlag = useCallback(() => {
    if (!progress) return;
    const id = progress.spec.questionIds[progress.index]!;
    const prev = progress.answers[id];
    commit({
      ...progress,
      answers: {
        ...progress.answers,
        [id]: prev
          ? { ...prev, flagged: !prev.flagged }
          : { choice: null, flagged: true, timeSeconds: 0, choiceSwitches: 0, touchedCorrect: false },
      },
    });
  }, [progress, commit]);

  const togglePause = useCallback(() => {
    if (!progress) return;
    const t = Date.now();
    const paused = isPaused(progress.clock);
    commit({
      ...progress,
      clock: paused ? resumeClock(progress.clock, t) : pauseClock(progress.clock, t),
      pauseCount: paused ? progress.pauseCount : progress.pauseCount + 1,
    });
    setNow(t);
  }, [progress, commit]);

  return {
    status,
    progress,
    result,
    remaining: progress ? remainingMs(progress.clock, now) : 0,
    start,
    resume,
    answer,
    goTo,
    toggleFlag,
    togglePause,
    submitNow: () => progress && submit(progress),
  };
}

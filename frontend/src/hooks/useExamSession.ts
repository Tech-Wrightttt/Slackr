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
    async (p: ExamProgress, openAnswered = false) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
        const t = Date.now();
        const clock = pauseClock(p.clock, t);
        // Submitting early (or the time running out) leaves the open question unanswered; it keeps
        // the time spent on it and any flag
        const openId = p.spec.questionIds[p.index];
        const answers = { ...p.answers };
        if (openId && !openAnswered) {
          answers[openId] = {
            choice: null,
            flagged: answers[openId]?.flagged ?? false,
            timeSeconds: (elapsedMs(clock, t) - p.questionOpenedAtMs) / 1000,
            choiceSwitches: 0,
            touchedCorrect: false,
          };
        }
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

  /** Saves the pick for the open question (or a skip) and moves on; the last one submits */
  const answer = useCallback(
    (entry: Omit<ExamAnswer, 'timeSeconds' | 'flagged'> | null) => {
      if (!progress || status !== 'running') return;
      const t = Date.now();
      const used = elapsedMs(progress.clock, t);
      const id = progress.spec.questionIds[progress.index]!;
      const prev = progress.answers[id];
      const stored: ExamAnswer = {
        choice: entry?.choice ?? null,
        choiceSwitches: entry?.choiceSwitches ?? 0,
        touchedCorrect: entry?.touchedCorrect ?? false,
        confidence: entry?.confidence,
        isCorrect: entry?.isCorrect,
        flagged: prev?.flagged ?? false,
        timeSeconds: (used - progress.questionOpenedAtMs) / 1000,
      };
      const next: ExamProgress = {
        ...progress,
        answers: { ...progress.answers, [id]: stored },
        index: progress.index + 1,
        questionOpenedAtMs: used,
      };
      if (next.index >= progress.spec.questionIds.length) {
        void submit({ ...next, index: progress.spec.questionIds.length - 1 }, true);
      } else {
        commit(next);
      }
    },
    [progress, status, commit, submit]
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
    toggleFlag,
    togglePause,
    submitNow: () => progress && submit(progress),
  };
}

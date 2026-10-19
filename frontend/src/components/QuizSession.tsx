import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QuestionCard, type SessionAnswer, type SubmittedAnswer } from './QuestionCard';
import { SessionReport } from './SessionReport';
import type { QuestionData, SessionQuestionLog, SessionType } from '../db/schema';
import { StatsDbService } from '../services/statsDb';
import { buildSessionReport, type SessionReportData } from '../services/sessionReport';
import { elapsedMs, formatClock, isPaused, pauseClock, resumeClock, startClock, type ExamClock } from '../services/examClock';
import { useStore } from '../store/useStore';

interface QuizSessionProps {
  questions: QuestionData[];
  sessionType: SessionType;
  /** Identifies the set across sessions, for the "vs last time" comparison */
  filterKey: string;
  title: string;
  exitLabel: string;
  onExit: () => void;
  initialIndex?: number;
  hideAnswers?: boolean;
  /** Past attempts, so the grid colors questions answered before this session */
  attemptStatusMap?: Record<string, { isCorrect: boolean }>;
  onAttempt?: (questionId: string, isCorrect: boolean) => void;
  /** Show the estimated mock score in the report (full papers) */
  withMockScore?: boolean;
}

const newSeed = () => Math.random().toString(36).slice(2, 10);

/**
 * One practice session over a fixed list of questions: answers survive navigating back and forth,
 * practice toggles live in the header, and finishing shows (and saves) the after-session report.
 */
export const QuizSession: React.FC<QuizSessionProps> = ({
  questions: initialQuestions,
  sessionType,
  filterKey,
  title,
  exitLabel,
  onExit,
  initialIndex = 0,
  hideAnswers,
  attemptStatusMap = {},
  onAttempt,
  withMockScore = false,
}) => {
  const { oneAttemptLimit, shuffleChoices, reviewShowsPreviousAnswer, setPracticePref } = useStore();

  // "Review mistakes" swaps in a smaller set without leaving the page
  const [run, setRun] = useState(() => ({
    questions: initialQuestions,
    filterKey,
    title,
    seed: newSeed(),
    startedAt: new Date().toISOString(),
  }));
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialIndex, initialQuestions.length - 1)));
  const [answers, setAnswers] = useState<Record<string, SessionAnswer>>({});
  const [retries, setRetries] = useState(0);
  const [clock, setClock] = useState<ExamClock>(() => startClock(Number.MAX_SAFE_INTEGER, Date.now()));
  const [now, setNow] = useState(Date.now());
  const [finished, setFinished] = useState<{ report: SessionReportData; sessionId: number; completedAt: string } | null>(null);
  const savingRef = useRef(false);

  const paused = isPaused(clock);
  const questions = run.questions;
  const current = questions[index];

  useEffect(() => {
    if (paused || finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [paused, finished]);

  const byId = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);

  const statusMap = useMemo(() => {
    const merged: Record<string, { isCorrect: boolean }> = { ...attemptStatusMap };
    for (const [id, a] of Object.entries(answers)) merged[id] = { isCorrect: a.isCorrect };
    return merged;
  }, [attemptStatusMap, answers]);

  const handleSubmitted = async (a: SubmittedAnswer) => {
    const res = await StatsDbService.recordAttempt(a.questionId, a.topic, a.selected, a.isCorrect, a.timeSeconds, a.confidence ?? 3, {
      choiceSwitches: a.choiceSwitches,
      mode: 'practice',
    });
    const { questionId, topic: _topic, ...entry } = a;
    setAnswers((prev) => ({ ...prev, [questionId]: entry }));
    onAttempt?.(questionId, a.isCorrect);
    return { schedule: res.schedule };
  };

  const finish = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const log: SessionQuestionLog[] = questions.map((q) => {
      const a = answers[q.id];
      return a
        ? {
            questionId: q.id,
            timeSeconds: a.timeSeconds,
            finalChoice: a.selected,
            isCorrect: a.isCorrect,
            choiceSwitches: a.choiceSwitches,
            touchedCorrect: a.touchedCorrect,
            flagged: false,
            confidence: a.confidence,
          }
        : { questionId: q.id, timeSeconds: 0, finalChoice: null, isCorrect: null, choiceSwitches: 0, flagged: false };
    });
    const completedAt = new Date().toISOString();
    const correct = log.filter((l) => l.isCorrect).length;
    const record = {
      sessionType,
      filterKey: run.filterKey,
      totalQuestions: questions.length,
      answeredQuestions: log.filter((l) => l.finalChoice !== null).length,
      correctAnswers: correct,
      startedAt: run.startedAt,
      completedAt,
      isCompleted: true,
      mode: 'practice' as const,
      title: run.title,
      questionIds: questions.map((q) => q.id),
      log,
    };
    try {
      const previous = await StatsDbService.getPreviousSession(record);
      const sessionId = await StatsDbService.saveCompletedSession(record);
      setFinished({ report: buildSessionReport(log, byId, { withMockScore, previous: previous?.log }), sessionId, completedAt });
    } finally {
      savingRef.current = false;
    }
  };

  const next = () => {
    if (index + 1 < questions.length) setIndex(index + 1);
    else finish();
  };

  const restart = (list: QuestionData[], label = run.title, key = run.filterKey) => {
    setRun({ questions: list, filterKey: key, title: label, seed: newSeed(), startedAt: new Date().toISOString() });
    setAnswers({});
    setIndex(0);
    setClock(startClock(Number.MAX_SAFE_INTEGER, Date.now()));
    setFinished(null);
  };

  if (finished) {
    return (
      <SessionReport
        report={finished.report}
        questions={byId}
        order={questions.map((q) => q.id)}
        title={run.title}
        mode="practice"
        completedAt={finished.completedAt}
        onReviewMistakes={(ids) =>
          restart(
            ids.map((id) => byId[id]).filter((q): q is QuestionData => !!q),
            `Review: ${run.title}`,
            `${run.filterKey}#review`
          )
        }
        onRetry={() => restart(questions)}
        onExit={onExit}
        exitLabel={exitLabel}
      />
    );
  }

  const saved = current ? answers[current.id] ?? null : null;
  // With the one-attempt limit an answered question is always shown read-only
  const showSaved = oneAttemptLimit || reviewShowsPreviousAnswer ? saved : null;
  const answeredCount = Object.keys(answers).length;
  const sessionSeconds = Math.floor(elapsedMs(clock, now) / 1000);

  const togglePause = () => {
    const t = Date.now();
    setClock((c) => (isPaused(c) ? resumeClock(c, t) : pauseClock(c, t)));
    setNow(t);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      {/* Session bar: exit, practice toggles, session timer */}
      <div className="flex flex-col gap-3 pb-2 border-b border-outline-variant/20 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          onClick={onExit}
          className="tap flex items-center gap-1.5 self-start min-h-[36px] text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>
          <span>{exitLabel}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <PracticeToggle
            label="One attempt"
            hint="Answered questions stay locked. Off: a Try again button appears."
            icon="lock"
            on={oneAttemptLimit}
            onChange={(v) => setPracticePref('oneAttemptLimit', v)}
          />
          <PracticeToggle
            label="Shuffle choices"
            hint="Random order that stays the same when you come back. Skipped for 'all of the above' style choices."
            icon="shuffle"
            on={shuffleChoices}
            onChange={(v) => setPracticePref('shuffleChoices', v)}
          />
          <button
            type="button"
            onClick={togglePause}
            aria-pressed={paused}
            className={`tap press-scale flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 font-mono-timer text-xs tabular-nums cursor-pointer transition-colors ${
              paused
                ? 'border-confidence-amber/40 bg-confidence-amber/12 text-confidence-amber'
                : 'border-outline-variant/30 bg-surface-container-low text-on-surface hover:bg-surface-container'
            }`}
            title={paused ? 'Resume the session timer' : 'Pause: hides the question and stops the clock'}
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{paused ? 'play_arrow' : 'pause'}</span>
            <span>{formatClock(sessionSeconds * 1000)}</span>
            <span className="sr-only">{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button
            type="button"
            onClick={finish}
            className="tap press-scale flex min-h-[36px] items-center gap-1.5 rounded-lg bg-surface-container-high px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer"
            title="End now and see the report"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">done_all</span>
            Finish ({answeredCount}/{questions.length})
          </button>
        </div>
      </div>

      {current ? (
        <QuestionCard
          question={current}
          questionNumber={index + 1}
          totalQuestions={questions.length}
          onAnswerSubmitted={handleSubmitted}
          onNextQuestion={next}
          onPreviousQuestion={() => index > 0 && setIndex(index - 1)}
          onSkipQuestion={next}
          hasNext={index + 1 < questions.length}
          hasPrevious={index > 0}
          questions={questions}
          currentIndex={index}
          onSelectIndex={setIndex}
          attemptStatusMap={statusMap}
          savedAnswer={showSaved}
          onRetry={
            oneAttemptLimit
              ? undefined
              : () => {
                  setAnswers((prev) => {
                    const nextMap = { ...prev };
                    delete nextMap[current.id];
                    return nextMap;
                  });
                  setRetries((n) => n + 1);
                }
          }
          resetToken={retries}
          shuffleSeed={shuffleChoices ? run.seed : null}
          paused={paused}
          hideAnswers={hideAnswers}
        />
      ) : (
        <div className="py-20 text-center text-on-surface-variant font-mono-code text-sm">No questions in this set.</div>
      )}
    </div>
  );
};

const PracticeToggle: React.FC<{ label: string; hint: string; icon: string; on: boolean; onChange: (v: boolean) => void }> = ({
  label,
  hint,
  icon,
  on,
  onChange,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={() => onChange(!on)}
    title={hint}
    className={`tap press-scale flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold cursor-pointer transition-colors ${
      on ? 'border-primary/40 bg-primary/12 text-primary' : 'border-outline-variant/30 bg-surface-container-low text-on-surface-variant hover:text-on-surface'
    }`}
  >
    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{icon}</span>
    {label}
    <span className="font-mono-code text-[10px] uppercase">{on ? 'On' : 'Off'}</span>
  </button>
);

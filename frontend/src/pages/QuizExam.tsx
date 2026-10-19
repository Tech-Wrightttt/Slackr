import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { QuestionCard } from '../components/QuestionCard';
import { SessionReport } from '../components/SessionReport';
import { QuizSession } from '../components/QuizSession';
import type { QuestionData, SessionRecord } from '../db/schema';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { ExamService, type ExamProgress, type ExamSetSpec } from '../services/examService';
import { buildSessionReport } from '../services/sessionReport';
import { formatClock } from '../services/examClock';
import { useExamSession } from '../hooks/useExamSession';
import { useStore } from '../store/useStore';

type View =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'intro'; spec: ExamSetSpec }
  | { kind: 'conflict'; saved: ExamProgress; spec: ExamSetSpec }
  | { kind: 'locked'; spec: ExamSetSpec; session: SessionRecord }
  | { kind: 'exam' }
  | { kind: 'review'; spec: ExamSetSpec; questions: QuestionData[] };

/**
 * Timed exam on one set: forward only, answers lock on moving on, no feedback until the end,
 * skipped questions count as wrong. One exam per set until it is reset.
 */
export const QuizExam: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const strictExam = useStore((s) => s.strictExam);
  const requested = (location.state as { exam?: ExamSetSpec } | null)?.exam ?? null;

  const [view, setView] = useState<View>({ kind: 'loading' });
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const byId = useMemo(() => Object.fromEntries(questions.map((q) => [q.id, q])), [questions]);
  const exam = useExamSession(byId);

  // A submitted exam becomes the set's locked result, which a reset can turn back into the intro
  useEffect(() => {
    if (exam.result && exam.progress) setView({ kind: 'locked', spec: exam.progress.spec, session: exam.result.session });
  }, [exam.result]);

  const loadQuestions = async (ids: string[]) => setQuestions(await QuestionsService.getQuestionsInOrder(ids));

  const showLockedOrIntro = async (spec: ExamSetSpec) => {
    const attempt = await ExamService.getAttempt(spec.setKey);
    const session = attempt ? await StatsDbService.getSession(attempt.sessionId) : undefined;
    await loadQuestions(spec.questionIds);
    setView(session ? { kind: 'locked', spec, session } : { kind: 'intro', spec });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await ExamService.loadProgress();
      if (cancelled) return;
      if (saved && (!requested || requested.setKey === saved.spec.setKey)) {
        await loadQuestions(saved.spec.questionIds);
        exam.resume(saved);
        setView({ kind: 'exam' });
      } else if (saved && requested) {
        setView({ kind: 'conflict', saved, spec: requested });
      } else if (requested) {
        await showLockedOrIntro(requested);
      } else {
        setView({ kind: 'empty' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per visit; the requested set comes from navigation state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backTo = () => navigate(-1);

  if (view.kind === 'loading') {
    return <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant">Loading exam…</div>;
  }

  if (view.kind === 'empty') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center flex flex-col items-center gap-4">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant" aria-hidden="true">timer_off</span>
        <h1 className="font-headline-md text-2xl font-bold text-on-surface">No exam selected</h1>
        <p className="text-sm text-on-surface-variant">
          Start a timed exam from a paper, a topic or a custom set with &ldquo;Take as timed exam&rdquo;.
        </p>
        <Link to="/quiz/year" className="press-scale min-h-[44px] inline-flex items-center rounded-xl bg-primary px-5 text-sm font-body-bold text-on-primary">
          Browse papers
        </Link>
      </div>
    );
  }

  if (view.kind === 'conflict') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 flex flex-col gap-4">
        <h1 className="font-headline-md text-2xl font-bold text-on-surface">You have an exam in progress</h1>
        <p className="text-sm text-on-surface-variant">
          &ldquo;{view.saved.spec.title}&rdquo; is still running. Finish it first, or discard it to start &ldquo;{view.spec.title}&rdquo;.
          Discarding saves nothing from the unfinished exam.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={async () => {
              await loadQuestions(view.saved.spec.questionIds);
              exam.resume(view.saved);
              setView({ kind: 'exam' });
            }}
            className="press-scale min-h-[44px] rounded-xl bg-primary px-5 text-sm font-body-bold text-on-primary cursor-pointer"
          >
            Resume &ldquo;{view.saved.spec.title}&rdquo;
          </button>
          <button
            type="button"
            onClick={async () => {
              await ExamService.clearProgress();
              await showLockedOrIntro(view.spec);
            }}
            className="press-scale min-h-[44px] rounded-xl border border-error/40 px-5 text-sm font-semibold text-error hover:bg-error/10 cursor-pointer"
          >
            Discard it
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === 'review') {
    return (
      <QuizSession
        questions={view.questions}
        sessionType="set"
        filterKey="exam-review"
        title={`Review: ${view.spec.title}`}
        exitLabel="Back to the exam result"
        onExit={() => void showLockedOrIntro(view.spec)}
      />
    );
  }

  const reviewMistakes = (spec: ExamSetSpec) => (ids: string[]) =>
    setView({ kind: 'review', spec, questions: ids.map((id) => byId[id]).filter((q): q is QuestionData => !!q) });

  if (view.kind === 'locked') {
    const { session, spec } = view;
    const report = buildSessionReport(session.log ?? [], byId, { withMockScore: true });
    return (
      <SessionReport
        report={report}
        questions={byId}
        order={session.questionIds ?? spec.questionIds}
        title={spec.title}
        mode="exam"
        pauseCount={session.pauseCount}
        completedAt={session.completedAt}
        onReviewMistakes={reviewMistakes(spec)}
        onResetExam={async () => {
          if (!window.confirm(`Reset the exam on "${spec.title}"? You can take it again. Your attempt history and this report stay.`)) return;
          await ExamService.resetAttempts(spec.setKey);
          setView({ kind: 'intro', spec });
        }}
        onExit={backTo}
        exitLabel="Back"
      />
    );
  }

  if (view.kind === 'intro') {
    const { spec } = view;
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-6">
        <div>
          <span className="rounded-full bg-tertiary/12 px-2.5 py-0.5 font-label-caps text-[11px] uppercase tracking-wider font-semibold text-tertiary">
            Timed exam
          </span>
          <h1 className="mt-3 font-headline-md text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">{spec.title}</h1>
          <p className="mt-1 font-mono-code text-sm text-on-surface-variant">
            {spec.questionIds.length} questions · {spec.minutes} minutes
          </p>
        </div>
        <ul className="flex flex-col gap-2.5 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 text-sm text-on-surface">
          {[
            ['arrow_forward', 'Forward only: an answer locks when you move on.'],
            ['visibility_off', 'No feedback until the end. Then you get the full report.'],
            ['remove_done', 'Skipped questions count as wrong.'],
            ['timer', 'The clock keeps running in the background. At 0 the exam submits itself.'],
            strictExam
              ? ['block', 'Strict exam: pausing is off (change it in Profile → Settings).']
              : ['pause', 'Pausing hides the question and stops the clock. Pauses show in the report.'],
            ['lock', 'One attempt per set. Reset it from the result screen or Settings.'],
          ].map(([icon, text]) => (
            <li key={icon} className="flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[18px] text-primary mt-px" aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => {
              exam.start(spec);
              setView({ kind: 'exam' });
            }}
            disabled={questions.length === 0}
            className="press-scale min-h-[48px] flex items-center gap-2 rounded-xl bg-primary px-6 text-sm font-body-bold text-on-primary shadow-lg hover:bg-primary-fixed-dim disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
            Start exam
          </button>
          <button type="button" onClick={backTo} className="press-scale min-h-[48px] rounded-xl px-4 text-sm font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer">
            Not now
          </button>
        </div>
      </div>
    );
  }

  // Running or paused
  const p = exam.progress;
  if (!p) return null;
  const current = byId[p.spec.questionIds[p.index] ?? ''];
  const paused = exam.status === 'paused';
  const lowTime = exam.remaining < 5 * 60_000;
  const answeredCount = Object.values(p.answers).filter((a) => a.choice !== null).length;
  const statusMap = Object.fromEntries(
    Object.entries(p.answers)
      .filter(([, a]) => a.choice !== null)
      .map(([id]) => [id, { isCorrect: true }])
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      <div className="sticky top-16 z-20 -mx-4 sm:mx-0 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 bg-surface-container-lowest/95 px-4 py-2.5 backdrop-blur sm:rounded-xl sm:border">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-on-surface">{p.spec.title}</p>
          <p className="font-mono-code text-xs text-on-surface-variant">
            {answeredCount} answered · question {p.index + 1} of {p.spec.questionIds.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            role="timer"
            aria-live="off"
            aria-label={`Time left ${formatClock(exam.remaining)}`}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 font-mono-timer text-base font-bold tabular-nums ${
              lowTime ? 'border-error/40 bg-error/10 text-error' : 'border-outline-variant/30 bg-surface-container-low text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">timer</span>
            {formatClock(exam.remaining)}
          </span>
          {!strictExam && (
            <button
              type="button"
              onClick={exam.togglePause}
              aria-pressed={paused}
              className="press-scale flex min-h-[40px] items-center gap-1.5 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 text-xs font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{paused ? 'play_arrow' : 'pause'}</span>
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const left = p.spec.questionIds.length - answeredCount;
              if (window.confirm(left > 0 ? `Submit now? ${left} unanswered question${left === 1 ? '' : 's'} will count as wrong.` : 'Submit the exam?')) {
                void exam.submitNow();
              }
            }}
            className="press-scale flex min-h-[40px] items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-body-bold text-on-primary hover:bg-primary-fixed-dim cursor-pointer"
          >
            Submit exam
          </button>
        </div>
      </div>

      {current ? (
        <QuestionCard
          variant="exam"
          question={current}
          questionNumber={p.index + 1}
          totalQuestions={p.spec.questionIds.length}
          questions={p.spec.questionIds.map((id) => byId[id]!).filter(Boolean)}
          currentIndex={p.index}
          attemptStatusMap={statusMap}
          paused={paused}
          flagged={!!p.answers[current.id]?.flagged}
          onToggleFlag={exam.toggleFlag}
          hasNext={p.index + 1 < p.spec.questionIds.length}
          onAnswerSubmitted={async (a) => {
            exam.answer({
              choice: a.selected,
              isCorrect: a.isCorrect,
              choiceSwitches: a.choiceSwitches,
              touchedCorrect: a.touchedCorrect,
              confidence: a.confidence,
            });
          }}
          onSkipQuestion={() => exam.answer(null)}
          onNextQuestion={() => exam.answer(null)}
        />
      ) : (
        <div className="py-20 text-center text-on-surface-variant font-mono-code text-sm">This question is missing from the question bank.</div>
      )}
    </div>
  );
};

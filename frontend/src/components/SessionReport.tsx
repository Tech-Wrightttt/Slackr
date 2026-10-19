import React from 'react';
import { Link } from 'react-router-dom';
import type { QuestionData, QuizMode } from '../db/schema';
import type { SessionReportData, TimedEntry } from '../services/sessionReport';
import { PASS_LINE } from '../services/scoring';
import { topicLabel } from '../services/topicColors';

interface SessionReportProps {
  report: SessionReportData;
  questions: Record<string, QuestionData>;
  /** Question ids in set order, to show "Q12" style numbers */
  order: string[];
  title: string;
  mode: QuizMode;
  pauseCount?: number;
  completedAt?: string;
  onReviewMistakes?: (ids: string[]) => void;
  onRetry?: () => void;
  onExit?: () => void;
  exitLabel?: string;
  /** Exam result screen: unlock this set for another attempt */
  onResetExam?: () => void;
}

const fmtTime = (sec: number) => {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, '0')}s`;
};

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 sm:p-5 flex flex-col gap-3">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="font-title-sm text-sm font-bold text-on-surface">{title}</h3>
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
    </div>
    {children}
  </section>
);

export const SessionReport: React.FC<SessionReportProps> = ({
  report: r,
  questions,
  order,
  title,
  mode,
  pauseCount,
  completedAt,
  onReviewMistakes,
  onRetry,
  onExit,
  exitLabel = 'Back',
  onResetExam,
}) => {
  const position = new Map(order.map((id, i) => [id, i + 1]));

  const QuestionChip: React.FC<{ id: string; children?: React.ReactNode }> = ({ id, children }) => {
    const q = questions[id];
    return (
      <Link
        to={`/history/${encodeURIComponent(id)}`}
        className="tap press-scale inline-flex items-center gap-1.5 min-h-[36px] rounded-lg border border-outline-variant/30 bg-surface-container px-2.5 py-1 font-mono-code text-xs text-on-surface hover:border-primary/50 hover:bg-surface-container-high transition-colors"
        title={`Open ${id}: every attempt and its trend`}
      >
        <span className="font-bold text-primary">Q{position.get(id) ?? '?'}</span>
        <span className="text-on-surface-variant">{q ? `${q.year} ${q.paper} #${q.number}` : id}</span>
        {children}
      </Link>
    );
  };

  const TimedList: React.FC<{ entries: TimedEntry[] }> = ({ entries }) =>
    entries.length === 0 ? (
      <p className="text-sm text-on-surface-variant">No answered questions.</p>
    ) : (
      <ol className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <li key={e.questionId} className="flex items-center justify-between gap-2">
            <QuestionChip id={e.questionId}>
              <span
                className={`material-symbols-outlined text-[15px] ${e.isCorrect ? 'text-success' : 'text-error'}`}
                aria-label={e.isCorrect ? 'Correct' : 'Wrong'}
              >
                {e.isCorrect ? 'check_circle' : 'cancel'}
              </span>
            </QuestionChip>
            <span className="flex items-center gap-2 font-mono-code text-xs tabular-nums text-on-surface">
              {e.rushed && (
                <span className="rounded-full bg-confidence-amber/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-confidence-amber">
                  Rushed
                </span>
              )}
              {fmtTime(e.timeSeconds)}
            </span>
          </li>
        ))}
      </ol>
    );

  const ChipList: React.FC<{ ids: string[]; empty: string }> = ({ ids, empty }) =>
    ids.length ? (
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <QuestionChip key={id} id={id} />
        ))}
      </div>
    ) : (
      <p className="text-sm text-on-surface-variant">{empty}</p>
    );

  const fatigue = r.secondHalfAccuracy - r.firstHalfAccuracy;
  const vsLast = r.previousAccuracy === null ? null : r.accuracy - r.previousAccuracy;
  const mockPass = r.mock ? r.mock.score >= PASS_LINE : false;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5 animate-in fade-in duration-300">
      {/* Header + headline numbers */}
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 font-label-caps text-[11px] uppercase tracking-wider font-semibold ${
              mode === 'exam' ? 'bg-tertiary/12 text-tertiary' : 'bg-primary/12 text-primary'
            }`}
          >
            {mode === 'exam' ? 'Exam' : 'Practice'}
          </span>
          {completedAt && (
            <span className="font-mono-code text-xs text-on-surface-variant">
              {new Date(completedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
        </div>
        <h2 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">{title}</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
            <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Score</p>
            <p className="mt-1 font-headline-md text-3xl font-bold text-on-surface tabular-nums">{r.accuracy}%</p>
            <p className="text-xs text-on-surface-variant tabular-nums">
              {r.correct} of {r.total} correct{r.skipped ? ` · ${r.skipped} skipped count as wrong` : ''}
            </p>
          </div>
          {r.mock ? (
            <div
              className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4"
              title="Estimated: the official per-question weights are not published, so each question is weighted by type (heavier for Subject B, code and calculations)."
            >
              <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Mock score (est.)</p>
              <p className={`mt-1 font-headline-md text-3xl font-bold tabular-nums ${mockPass ? 'text-success' : 'text-error'}`}>
                {r.mock.score}
                <span className="text-base font-semibold text-on-surface-variant"> / 1000</span>
              </p>
              <p className="text-xs text-on-surface-variant">
                Pass line {PASS_LINE} · {mockPass ? 'above it' : 'below it'} · weights are estimates
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
              <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Answered</p>
              <p className="mt-1 font-headline-md text-3xl font-bold text-on-surface tabular-nums">
                {r.answered}
                <span className="text-base font-semibold text-on-surface-variant"> / {r.total}</span>
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
            <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Total time</p>
            <p className="mt-1 font-headline-md text-3xl font-bold text-on-surface tabular-nums">{fmtTime(r.totalSeconds)}</p>
            <p className="text-xs text-on-surface-variant tabular-nums">{fmtTime(r.averageSeconds)} per answered question</p>
          </div>
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
            <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Time on wrong answers</p>
            <p className="mt-1 font-headline-md text-3xl font-bold text-on-surface tabular-nums">{Math.round(r.timeOnWrongShare * 100)}%</p>
            <p className="text-xs text-on-surface-variant">
              {mode === 'exam' && pauseCount !== undefined ? `${pauseCount} pause${pauseCount === 1 ? '' : 's'}` : 'of the whole session'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {onReviewMistakes && r.reviewIds.length > 0 && (
            <button
              type="button"
              onClick={() => onReviewMistakes(r.reviewIds)}
              className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl bg-primary px-5 text-sm font-body-bold text-on-primary shadow-lg hover:bg-primary-fixed-dim cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">school</span>
              Review mistakes ({r.reviewIds.length})
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-5 text-sm font-body-bold text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">replay</span>
              Retry set
            </button>
          )}
          {onResetExam && (
            <button
              type="button"
              onClick={onResetExam}
              className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-5 text-sm font-body-bold text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">lock_open</span>
              Reset this exam
            </button>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl px-4 text-sm font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
              {exitLabel}
            </button>
          )}
        </div>
      </header>

      {/* Insight strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
          <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Fooled</p>
          <p className="mt-1 text-xl font-bold text-on-surface tabular-nums">
            {r.fooled.wrong} <span className="text-sm font-semibold text-on-surface-variant">of {r.fooled.total}</span>
          </p>
          <p className="text-xs text-on-surface-variant">sure answers (level 4 or 5) that were wrong</p>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
          <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">First half vs second half</p>
          <p className="mt-1 text-xl font-bold text-on-surface tabular-nums">
            {r.firstHalfAccuracy}% <span className="text-on-surface-variant">→</span> {r.secondHalfAccuracy}%
          </p>
          <p className="text-xs text-on-surface-variant">
            {r.total < 6 ? 'Too short to show fatigue' : fatigue <= -15 ? 'Accuracy dropped late: fatigue?' : 'Steady across the session'}
          </p>
        </div>
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
          <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Vs last time on this set</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${vsLast === null ? 'text-on-surface-variant' : vsLast >= 0 ? 'text-success' : 'text-error'}`}>
            {vsLast === null ? '—' : `${vsLast >= 0 ? '+' : ''}${vsLast} pts`}
          </p>
          <p className="text-xs text-on-surface-variant">
            {r.previousAccuracy === null ? 'First report for this set' : `Last time: ${r.previousAccuracy}%`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Slowest 5" hint="Where the time went">
          <TimedList entries={r.slowest} />
        </Section>
        <Section title="Fastest 5" hint={`Wrong in under 20s counts as rushed`}>
          <TimedList entries={r.fastest} />
        </Section>

        <Section title="Unsure" hint="Changed the pick twice or more">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-success">Switched to the right answer ({r.switchedToRight.length})</p>
              <ChipList ids={r.switchedToRight} empty="None" />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-error">Switched away from the right answer ({r.switchedAwayFromRight.length})</p>
              <ChipList ids={r.switchedAwayFromRight} empty="None" />
            </div>
            {r.unsureWrong.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-on-surface-variant">Never picked the right one ({r.unsureWrong.length})</p>
                <ChipList ids={r.unsureWrong} empty="None" />
              </div>
            )}
          </div>
        </Section>

        <Section title="Skipped and flagged">
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-on-surface-variant">Skipped ({r.skippedIds.length})</p>
              <ChipList ids={r.skippedIds} empty="Nothing skipped" />
            </div>
            {mode === 'exam' && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-confidence-amber">Flagged ({r.flaggedIds.length})</p>
                <ChipList ids={r.flaggedIds} empty="Nothing flagged" />
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title="Topics in this session" hint="Weakest first">
        <ul className="flex flex-col gap-2">
          {r.byTopic.map((t) => (
            <li key={t.topic} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3">
              <span className="truncate text-sm text-on-surface" title={topicLabel(t.topic)}>
                {topicLabel(t.topic)}
              </span>
              <span className="h-2 rounded-full bg-surface-container-highest overflow-hidden" aria-hidden="true">
                <span
                  className={`block h-full rounded-full ${t.accuracy >= 60 ? 'bg-success' : 'bg-error'}`}
                  style={{ width: `${Math.max(t.accuracy, 2)}%` }}
                />
              </span>
              <span className="font-mono-code text-xs tabular-nums text-on-surface">
                {t.accuracy}% <span className="text-on-surface-variant">({t.correct}/{t.total})</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
};

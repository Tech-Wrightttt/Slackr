import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnalyticsEngine } from '../services/analyticsEngine';
import type { YearDetail } from '../services/yearDetail';
import { topicLabel } from '../services/topicColors';

const fmtSec = (s: number | null) => (s === null ? '—' : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`);

const Stat: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode }> = ({ label, value, note }) => (
  <div className="rounded-xl border border-outline-variant/25 bg-surface-container-low p-3">
    <p className="text-[11px] font-label-caps uppercase tracking-wider text-on-surface-variant">{label}</p>
    <p className="mt-0.5 text-xl font-bold text-on-surface tabular-nums">{value}</p>
    {note && <p className="text-xs text-on-surface-variant">{note}</p>}
  </div>
);

/** Progress for one exam year: a side drawer on wide screens, a bottom sheet on phones */
export const YearStatsPanel: React.FC<{ year: string; onClose: () => void }> = ({ year, onClose }) => {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<YearDetail | null>(null);

  useEffect(() => {
    let live = true;
    AnalyticsEngine.getYearDetail(year).then((d) => live && setDetail(d));
    return () => {
      live = false;
    };
  }, [year]);

  // Focus into the panel, lock page scroll, and hand focus back on close
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      trigger?.focus?.();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
    if (!focusable?.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const d = detail;
  const slower = d && d.avgSeconds !== null && d.overallAvgSeconds !== null ? d.avgSeconds - d.overallAvgSeconds : null;
  const trend = d && d.firstAttemptAccuracy !== null && d.latestAttemptAccuracy !== null ? d.latestAttemptAccuracy - d.firstAttemptAccuracy : null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-stretch sm:justify-end">
      <div className="sheet-backdrop absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onKeyDown={onKeyDown}
        className="sheet-dialog relative w-full sm:max-w-md max-h-[92dvh] sm:max-h-none sm:h-full flex flex-col rounded-t-2xl sm:rounded-none border border-outline-variant/40 bg-surface-container-lowest shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <span className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-outline-variant/60" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 sm:pt-5 pb-3 border-b border-outline-variant/20">
          <h2 id={`${uid}-title`} className="font-headline-md text-lg font-bold text-on-surface">
            {year} progress
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press-scale flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {!d ? (
            <p className="py-10 text-center font-mono-code text-sm text-on-surface-variant">Counting your attempts…</p>
          ) : d.overall.attempted === 0 ? (
            <p className="py-10 text-center text-sm text-on-surface-variant">No answers from {year} yet. Practice a paper and the stats appear here.</p>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-on-surface">Accuracy and coverage</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Accuracy" value={`${d.overall.accuracy}%`} note={`${d.overall.correct} correct answers`} />
                  <Stat label="Coverage" value={`${d.overall.coverage}%`} note={`${d.overall.attempted} of ${d.overall.total} questions tried`} />
                </div>
                {d.papers.length > 1 && (
                  <ul className="flex flex-col gap-1.5">
                    {d.papers.map((p) => (
                      <li key={p.label} className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-low px-3 py-2 text-xs">
                        <span className="font-semibold text-on-surface">{p.label}</span>
                        <span className="font-mono-code tabular-nums text-on-surface-variant">
                          {p.accuracy}% accuracy · {p.attempted}/{p.total} tried
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="grid grid-cols-2 gap-2">
                <Stat
                  label="Time per answer"
                  value={fmtSec(d.avgSeconds)}
                  note={slower === null ? 'No overall average yet' : `${slower > 0 ? `${Math.round(slower)}s slower` : `${Math.round(-slower)}s faster`} than your average`}
                />
                <Stat
                  label="Fooled"
                  value={d.fooled.sure ? `${Math.round((d.fooled.wrong / d.fooled.sure) * 100)}%` : '—'}
                  note={`${d.fooled.wrong} of ${d.fooled.sure} sure answers were wrong`}
                />
                <Stat
                  label="Trend"
                  value={trend === null ? '—' : `${trend >= 0 ? '+' : ''}${trend} pts`}
                  note={`First try ${d.firstAttemptAccuracy}% → latest ${d.latestAttemptAccuracy}%`}
                />
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-on-surface">Weakest topics this year</h3>
                {d.weakestTopics.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">Needs at least 2 answers in a topic.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {d.weakestTopics.map((t) => (
                      <li key={t.topic} className="flex items-center justify-between gap-2 text-sm">
                        <Link to={`/quiz/topic?topic=${encodeURIComponent(t.topic)}`} className="text-on-surface hover:text-primary underline-offset-2 hover:underline">
                          {topicLabel(t.topic)}
                        </Link>
                        <span className="font-mono-code text-xs tabular-nums text-error">
                          {t.accuracy}% <span className="text-on-surface-variant">({t.attempts} answers)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-on-surface">Repeat traps</h3>
                <p className="text-xs text-on-surface-variant">Answered wrong twice or more.</p>
                {d.repeatTraps.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">None so far.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {d.repeatTraps.map((t) => (
                      <li key={t.questionId}>
                        <Link
                          to={`/history/${encodeURIComponent(t.questionId)}`}
                          className="tap press-scale inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-error/30 bg-error/8 px-2.5 font-mono-code text-xs text-on-surface hover:bg-error/15"
                        >
                          {t.questionId}
                          <span className="text-error font-bold">×{t.wrong}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SessionRecord } from '../db/schema';
import { StatsDbService } from '../services/statsDb';
import { accuracyOfTotal } from '../services/scoring';

/** Finished sessions that kept a report (v1.2+), newest first; each opens its report */
export const RecentReports: React.FC<{ limit?: number }> = ({ limit = 8 }) => {
  const [rows, setRows] = useState<SessionRecord[] | null>(null);
  const [mode, setMode] = useState<'all' | 'practice' | 'exam'>('all');

  useEffect(() => {
    StatsDbService.getRecentReports(40).then(setRows);
  }, []);

  if (!rows || rows.length === 0) return null;
  const shown = rows.filter((r) => mode === 'all' || (r.mode ?? 'practice') === mode).slice(0, limit);

  return (
    <section aria-labelledby="recent-reports" className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-reports" className="text-sm font-bold text-on-surface">
          Session reports
        </h2>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface-container p-0.5" role="group" aria-label="Filter by mode">
          {(['all', 'practice', 'exam'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`tap min-h-[32px] rounded-md px-3 text-xs font-semibold capitalize cursor-pointer ${
                mode === m ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No {mode} sessions yet.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/15">
          {shown.map((r) => {
            const acc = accuracyOfTotal(r.correctAnswers, r.totalQuestions);
            const exam = r.mode === 'exam';
            return (
              <li key={r.id}>
                <Link
                  to={`/report/${r.id}`}
                  className="flex min-h-[48px] items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-container transition-colors"
                >
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      exam ? 'bg-tertiary/12 text-tertiary' : 'bg-primary/12 text-primary'
                    }`}
                  >
                    {exam ? 'Exam' : 'Practice'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-on-surface">{r.title ?? r.filterKey}</span>
                  <span className="shrink-0 font-mono-code text-xs tabular-nums text-on-surface-variant">
                    {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : ''}
                  </span>
                  <span className={`shrink-0 w-12 text-right font-mono-code text-sm font-bold tabular-nums ${acc >= 60 ? 'text-success' : 'text-error'}`}>
                    {acc}%
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

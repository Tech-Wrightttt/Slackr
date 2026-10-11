import React from 'react';
import { RELEASES, type Release } from '../data/releases';

const CHANGE_STYLE: Record<Release['changes'][number]['type'], { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-primary/10 text-primary' },
  improved: { label: 'Improved', className: 'bg-secondary-container/40 text-on-surface' },
  fixed: { label: 'Fixed', className: 'bg-confidence-amber/15 text-confidence-amber' },
};

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const News: React.FC = () => (
  <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 enter-rise">
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <span className="font-mono-timer text-[11px] font-semibold tracking-wider text-primary">NEWS</span>
        <h1 className="font-display-lg text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
          What's new in SLACKR
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">Every release, what it added, and how the app is growing.</p>
      </div>
      <span className="self-start sm:self-auto inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container-low px-3 py-1 font-mono-code text-xs text-on-surface-variant">
        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">deployed_code</span>
        You're on v{__APP_VERSION__}
      </span>
    </header>

    {RELEASES.length === 0 ? (
      <section className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low px-6 py-14 flex flex-col items-center text-center gap-3">
        <span className="material-symbols-outlined text-[40px] text-on-surface-variant/60" aria-hidden="true">
          campaign
        </span>
        <h2 className="text-base font-semibold text-on-surface">No release notes yet</h2>
        <p className="text-sm text-on-surface-variant max-w-sm">
          New versions and the features they bring will show up here.
        </p>
      </section>
    ) : (
      <ol className="relative flex flex-col gap-6 border-l border-outline-variant/30 ml-2">
        {RELEASES.map((r) => (
          <li key={r.version} className="relative pl-6">
            <span className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-primary" aria-hidden="true" />
            <article className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-sm flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-lg font-bold text-on-surface">v{r.version}</h2>
                <time dateTime={r.date} className="font-mono-code text-xs text-on-surface-variant">
                  {formatDate(r.date)}
                </time>
              </div>
              <p className="text-sm font-semibold text-on-surface">{r.title}</p>
              <ul className="flex flex-col gap-2">
                {r.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                    <span
                      className={`shrink-0 mt-0.5 rounded-md px-1.5 py-0.5 font-mono-code text-[11px] font-semibold ${CHANGE_STYLE[c.type].className}`}
                    >
                      {CHANGE_STYLE[c.type].label}
                    </span>
                    <span>{c.text}</span>
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>
    )}
  </div>
);

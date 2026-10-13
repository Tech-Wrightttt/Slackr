import React from 'react';
import { RELEASES, type Release } from '../data/releases';

type ChangeType = Release['changes'][number]['type'];

const CHANGE_STYLE: Record<ChangeType, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-primary/12 text-primary' },
  improved: { label: 'Improved', className: 'bg-interactive-sky/12 text-interactive-sky' },
  fixed: { label: 'Fixed', className: 'bg-confidence-amber/15 text-confidence-amber' },
};

// Icon per area so a long release scans by section; unknown areas fall back to a generic mark
const AREA_ICON: Record<string, string> = {
  Practice: 'quiz',
  'Spaced repetition': 'repeat',
  'Progress & analytics': 'insights',
  'Offline & data': 'cloud_off',
  Accounts: 'account_circle',
  'Help & feedback': 'support',
  'Look & feel': 'palette',
};

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

// Keeps the order areas first appear in the release
const groupByArea = (changes: Release['changes']) => {
  const groups = new Map<string, Release['changes']>();
  for (const c of changes) {
    const key = c.area ?? '';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()];
};

const ChangeTag: React.FC<{ type: ChangeType }> = ({ type }) => (
  <span
    className={`shrink-0 mt-px sm:w-[4.75rem] text-center rounded-md px-1.5 py-0.5 font-mono-code text-[11px] font-semibold ${CHANGE_STYLE[type].className}`}
  >
    {CHANGE_STYLE[type].label}
  </span>
);

const ReleaseCard: React.FC<{ release: Release; latest: boolean }> = ({ release: r, latest }) => {
  const counts = r.changes.reduce<Record<ChangeType, number>>(
    (acc, c) => ({ ...acc, [c.type]: acc[c.type] + 1 }),
    { new: 0, improved: 0, fixed: 0 }
  );

  return (
    <article
      className={`rounded-2xl border p-5 sm:p-7 flex flex-col gap-6 ${
        latest ? 'news-latest border-primary/25' : 'border-outline-variant/30 bg-surface-container-low'
      }`}
    >
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rounded-lg bg-primary px-2.5 py-1 font-mono-code text-sm font-bold text-on-primary">
            v{r.version}
          </span>
          {latest && (
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold text-primary">Latest</span>
          )}
          <time dateTime={r.date} className="font-mono-code text-xs text-on-surface-variant">
            {formatDate(r.date)}
          </time>
        </div>
        <h2 className="font-display-lg text-xl sm:text-2xl font-bold tracking-tight text-on-surface text-balance">
          {r.title}
        </h2>
        {r.summary && <p className="text-sm sm:text-[15px] leading-relaxed text-on-surface-variant max-w-[65ch]">{r.summary}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {(Object.keys(counts) as ChangeType[])
            .filter((t) => counts[t] > 0)
            .map((t) => (
              <span key={t} className={`rounded-full px-2.5 py-0.5 font-mono-code text-[11px] font-semibold ${CHANGE_STYLE[t].className}`}>
                {counts[t]} {CHANGE_STYLE[t].label.toLowerCase()}
              </span>
            ))}
        </div>
      </header>

      <div className="flex flex-col gap-6">
        {groupByArea(r.changes).map(([area, items]) => (
          <section key={area || 'changes'} className="flex flex-col gap-3">
            {area && (
              <h3 className="flex items-center gap-2 text-sm font-bold text-on-surface">
                <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary" aria-hidden="true">
                  <span className="material-symbols-outlined text-[16px]">{AREA_ICON[area] ?? 'auto_awesome'}</span>
                </span>
                {area}
              </h3>
            )}
            <ul className="flex flex-col gap-2.5">
              {items.map((c, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-on-surface-variant">
                  <ChangeTag type={c.type} />
                  <span className="min-w-0">{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
};

export const News: React.FC = () => (
  <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 enter-rise">
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
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
      <ol className="flex flex-col gap-6">
        {RELEASES.map((r, i) => (
          <li key={r.version}>
            <ReleaseCard release={r} latest={i === 0} />
          </li>
        ))}
      </ol>
    )}
  </div>
);

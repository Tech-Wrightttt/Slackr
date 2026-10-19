import React, { useEffect, useRef, useState } from 'react';
import { RELEASES, UNRELEASED, type Release } from '../data/releases';
import { markNewsSeen } from '../services/newsSeen';

type ChangeType = Release['changes'][number]['type'];
type Entry = Omit<Release, 'version'> & { version?: string };

const CHANGE_STYLE: Record<ChangeType, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-primary/12 text-primary' },
  improved: { label: 'Improved', className: 'bg-interactive-sky/12 text-interactive-sky' },
  fixed: { label: 'Fixed', className: 'bg-confidence-amber/15 text-confidence-amber' },
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

/** One release on the timeline: headline features up front, every change behind a toggle. */
const ReleaseCard: React.FC<{ release: Entry; current: boolean }> = ({ release: r, current }) => {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const panelId = `changes-${r.version ?? 'next'}`;
  // A launch is all new by definition, so it lists features without New / Improved / Fixed labels
  const isLaunch = r.changes.every((c) => c.type === 'new');
  const noun = isLaunch ? 'features' : 'changes';
  const collapse = () => {
    setOpen(false);
    // The list can be long: bring the card's top back into view after closing from the bottom
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const counts = r.changes.reduce<Record<ChangeType, number>>(
    (acc, c) => ({ ...acc, [c.type]: acc[c.type] + 1 }),
    { new: 0, improved: 0, fixed: 0 }
  );
  // Without curated highlights, fall back to the first few "new" items
  const highlights = r.highlights?.length
    ? r.highlights
    : r.changes.filter((c) => c.type === 'new').slice(0, 3).map((c) => c.text);

  return (
    <article
      ref={cardRef}
      className={`scroll-mt-24 rounded-2xl border p-5 sm:p-6 flex flex-col gap-5 ${
        !r.version
          ? 'border-dashed border-interactive-sky/40 bg-surface-container-low'
          : current
            ? 'news-latest border-primary/25'
            : 'border-outline-variant/30 bg-surface-container-low'
      }`}
    >
      <header className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {r.version ? (
            <span className="rounded-lg bg-primary px-2.5 py-1 font-mono-code text-sm font-bold text-on-primary">
              v{r.version}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-interactive-sky/12 px-2.5 py-1 font-mono-code text-sm font-bold text-interactive-sky">
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">update</span>
              Updates
            </span>
          )}
          {current && (
            <span className="news-current-tag inline-flex items-center gap-1 rounded-full bg-primary/12 py-0.5 pl-1.5 pr-2.5 text-[11px] font-semibold text-primary">
              <span className="news-sparkle material-symbols-outlined text-[15px]" aria-hidden="true">auto_awesome</span>
              Your version
            </span>
          )}
          {!r.version && (
            <span className="rounded-full bg-surface-container-high px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
              Not a version yet
            </span>
          )}
          <time dateTime={r.date} className="font-mono-code text-xs text-on-surface-variant">
            {formatDate(r.date)}
          </time>
        </div>
        <h2 className="font-display-lg text-lg sm:text-xl font-bold tracking-tight text-on-surface text-balance">
          {r.title}
        </h2>
        {r.summary && <p className="text-sm leading-relaxed text-on-surface-variant max-w-[65ch]">{r.summary}</p>}
      </header>

      {highlights.length > 0 && (
        <ul className="flex flex-col gap-2.5" aria-label="Highlights">
          {highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-on-surface">
              <span className="mt-[0.7em] h-px w-3 shrink-0 bg-primary" aria-hidden="true" />
              <span className="min-w-0">{h}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-4 border-t border-outline-variant/20 pt-4">
        {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          className="press-scale group w-[calc(100%+1.5rem)] -mx-3 min-h-[44px] flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl px-3 py-1 text-left hover:bg-surface-container cursor-pointer"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
            <span
              className="material-symbols-outlined text-[20px] text-primary"
              aria-hidden="true"
            >
              expand_more
            </span>
            See all {r.changes.length} {noun}
          </span>
          {!isLaunch && (
          <span className="flex flex-wrap gap-1.5" aria-hidden="true">
            {(Object.keys(counts) as ChangeType[])
              .filter((t) => counts[t] > 0)
              .map((t) => (
                <span key={t} className={`rounded-full px-2 py-0.5 font-mono-code text-[11px] font-semibold ${CHANGE_STYLE[t].className}`}>
                  {counts[t]} {CHANGE_STYLE[t].label.toLowerCase()}
                </span>
              ))}
          </span>
          )}
        </button>
        )}

        {open && (
          <div id={panelId} className="news-changes flex flex-col gap-6">
            {groupByArea(r.changes).map(([area, items]) => (
              <section key={area || 'changes'} className="flex flex-col gap-3">
                {area && (
                  <h3 className="flex items-center gap-3 font-mono-code text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    {area}
                    <span className="h-px flex-1 bg-outline-variant/30" aria-hidden="true" />
                  </h3>
                )}
                <ul className="flex flex-col gap-2.5">
                  {items.map((c, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-on-surface-variant">
                      {isLaunch ? (
                        <span className="mt-[0.7em] h-px w-3 shrink-0 bg-outline-variant" aria-hidden="true" />
                      ) : (
                        <ChangeTag type={c.type} />
                      )}
                      <span className="min-w-0">{c.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <button
              type="button"
              onClick={collapse}
              aria-expanded={true}
              aria-controls={panelId}
              className="press-scale self-stretch sm:self-start min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-high cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">expand_less</span>
              Hide {noun}
            </button>
          </div>
        )}
      </div>
    </article>
  );
};

export const News: React.FC = () => {
  // Opening the page clears the navbar's unread dot
  useEffect(() => {
    markNewsSeen();
  }, []);

  // Newest first: unreleased updates (if any) sit above the latest version
  const entries: Entry[] = [...(UNRELEASED && UNRELEASED.changes.length > 0 ? [UNRELEASED] : []), ...RELEASES];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 enter-rise">
      <header>
        <h1 className="font-display-lg text-2xl sm:text-3xl font-bold tracking-tight text-on-surface">
          What's new in SLACKR
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">How SLACKR has grown, newest first.</p>
      </header>

      {entries.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container-low px-6 py-14 flex flex-col items-center text-center gap-3">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant/60" aria-hidden="true">
            campaign
          </span>
          <h2 className="text-base font-semibold text-on-surface">No release notes yet</h2>
          <p className="text-sm text-on-surface-variant max-w-sm">New versions and the features they bring will show up here.</p>
        </section>
      ) : (
        // Timeline: a rail with one node per release (hidden on narrow phones to save width)
        <ol className="relative flex flex-col gap-6 sm:pl-8 sm:before:absolute sm:before:left-[11px] sm:before:top-3 sm:before:bottom-3 sm:before:w-px sm:before:bg-outline-variant/40">
          {entries.map((r) => {
            const current = r.version === __APP_VERSION__;
            return (
              <li key={r.version ?? 'next'} className="relative">
                <span
                  aria-hidden="true"
                  className={`hidden sm:block absolute -left-8 top-6 w-[23px] h-[23px] rounded-full border-4 border-surface-container-lowest ${
                    current ? 'news-node-current bg-primary' : r.version ? 'bg-outline-variant' : 'bg-interactive-sky'
                  }`}
                />
                <ReleaseCard release={r} current={current} />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DailyActivity } from '../services/analyticsEngine';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GAP = 3;

// Quartile-ish thresholds on questions answered per day
const levelFor = (count: number) => (count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : count < 30 ? 3 : 4);

const describeDay = (day: { date: string; count: number; correct: number }) =>
  `${day.count === 0 ? 'No questions' : `${day.count} question${day.count === 1 ? '' : 's'}`} on ${parseKey(
    day.date
  ).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}${
    day.count ? ` · ${Math.round((day.correct / day.count) * 100)}% correct` : ''
  }`;

const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export const ActivityCalendar: React.FC<{ activity: DailyActivity }> = ({ activity }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Larger squares on touch screens so a fingertip can hit a single day
  const [cell] = useState(() => (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 14 : 11));
  // Touch screens have no hover tooltips, so a tap pins the day's details below the grid
  const [selected, setSelected] = useState<DailyActivity['days'][number] | null>(null);

  // Columns are weeks (Sunday first), like GitHub; pad the first column so weekdays line up
  const weeks = useMemo(() => {
    const days = activity.days;
    if (days.length === 0) return [];
    const lead = parseKey(days[0]!.date).getDay();
    const cells: Array<DailyActivity['days'][number] | null> = [...Array(lead).fill(null), ...days];
    const cols: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));
    return cols;
  }, [activity.days]);

  const monthLabels = useMemo(() => {
    const labels: Array<{ col: number; label: string }> = [];
    let lastMonth = -1;
    weeks.forEach((col, i) => {
      const first = col.find((c) => c !== null);
      if (!first) return;
      const m = parseKey(first.date).getMonth();
      if (m !== lastMonth) {
        // Skip a label that would collide with the previous one
        if (!labels.length || i - labels[labels.length - 1]!.col >= 3) labels.push({ col: i, label: MONTHS[m]! });
        lastMonth = m;
      }
    });
    return labels;
  }, [weeks]);

  // Most recent weeks matter most: start scrolled to today on narrow screens
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length]);

  const todayKey = activity.days[activity.days.length - 1]?.date;

  return (
    <div className="flex flex-col gap-2">
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="inline-flex gap-2 min-w-max">
          {/* Weekday labels */}
          <div
            className="grid font-mono-code text-[10px] text-on-surface-variant/70 pt-[18px]"
            style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: GAP }}
            aria-hidden="true"
          >
            {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
              <span key={i} style={{ lineHeight: `${cell}px` }}>
                {d}
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-[6px]">
            <div className="relative h-3 font-mono-code text-[10px] text-on-surface-variant/70" aria-hidden="true">
              {monthLabels.map((m) => (
                <span key={m.col} className="absolute" style={{ left: m.col * (cell + GAP) }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className="flex" style={{ gap: GAP }} role="grid" aria-label="Questions answered per day">
              {weeks.map((col, wi) => (
                <div key={wi} className="flex flex-col" style={{ gap: GAP }}>
                  {col.map((day, di) =>
                    day ? (
                      <button
                        key={day.date}
                        type="button"
                        className="activity-cell block p-0 border-0 cursor-pointer"
                        style={{ width: cell, height: cell }}
                        data-level={levelFor(day.count)}
                        data-today={day.date === todayKey}
                        data-selected={selected?.date === day.date}
                        title={describeDay(day)}
                        aria-label={describeDay(day)}
                        onClick={() => setSelected((s) => (s?.date === day.date ? null : day))}
                      />
                    ) : (
                      <div key={`pad-${di}`} style={{ width: cell, height: cell }} />
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono-code text-[11px] text-on-surface-variant">
        <span className={selected ? 'text-on-surface font-semibold' : undefined}>
          {selected ? describeDay(selected) : "Only answered questions count. Browsing and skipping don't."}
        </span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="activity-cell inline-block" data-level={l} />
          ))}
          More
        </span>
      </div>
    </div>
  );
};

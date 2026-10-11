import React, { useMemo } from 'react';
import {
  computeMatchRanges,
  excerptAround,
  parseQuery,
  type MatchRange,
  type ParsedQuery,
} from '../services/searchEngine';

interface HighlightTextProps {
  text: string;
  /** Raw query string or an already-parsed query. Ignored when `ranges` is given. */
  query?: string | ParsedQuery;
  /** Explicit ranges to highlight (offsets into `text`). */
  ranges?: MatchRange[];
  /** When set, show only a window of ~2×radius chars around the first match. */
  excerptRadius?: number;
  className?: string;
}

/** Renders text with matched portions wrapped in <mark>. Plain React nodes, never innerHTML. */
export const HighlightText: React.FC<HighlightTextProps> = ({ text, query, ranges, excerptRadius, className }) => {
  const segments = useMemo(() => {
    const parsed = typeof query === 'string' ? parseQuery(query) : query;
    let r = ranges ?? (parsed ? computeMatchRanges(text, parsed) : []);
    let t = text;
    if (excerptRadius) ({ text: t, ranges: r } = excerptAround(text, r, excerptRadius));

    const out: { text: string; hit: boolean }[] = [];
    let cursor = 0;
    for (const { start, end } of r) {
      if (start > cursor) out.push({ text: t.slice(cursor, start), hit: false });
      out.push({ text: t.slice(start, end), hit: true });
      cursor = end;
    }
    if (cursor < t.length) out.push({ text: t.slice(cursor), hit: false });
    return out;
  }, [text, query, ranges, excerptRadius]);

  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.hit ? (
          <mark key={i} className="search-mark">
            {s.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        )
      )}
    </span>
  );
};

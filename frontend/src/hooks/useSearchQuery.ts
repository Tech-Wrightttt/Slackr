import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QuestionData } from '../db/schema';
import { parseQuery, searchQuestions, type SearchMatch } from '../services/searchEngine';

const DEFAULT_DEBOUNCE_MS = 180;

/**
 * Debounced search over question records.
 * `matches` is null when the query is empty, otherwise ranked results.
 * Pass `{ immediate: true }` to skip the debounce (pastes, clearing).
 */
export function useSearchQuery(records: QuestionData[], debounceMs = DEFAULT_DEBOUNCE_MS) {
  const [input, setInputState] = useState('');
  const [committed, setCommitted] = useState('');

  useEffect(() => {
    if (input === committed) return;
    const t = window.setTimeout(() => setCommitted(input), debounceMs);
    return () => window.clearTimeout(t);
  }, [input, committed, debounceMs]);

  const setInput = useCallback((value: string, opts?: { immediate?: boolean }) => {
    setInputState(value);
    if (opts?.immediate || value.trim() === '') setCommitted(value);
  }, []);

  const parsed = useMemo(() => parseQuery(committed), [committed]);
  const matches = useMemo<SearchMatch[] | null>(
    () => (parsed.isEmpty ? null : searchQuestions(records, parsed)),
    [records, parsed]
  );

  return { input, setInput, parsed, matches, isPending: input !== committed };
}

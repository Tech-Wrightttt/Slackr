import React, { useState, useEffect, useMemo } from 'react';
import { QuestionsService, type QuestionKindFilter } from '../services/questionsService';
import { db, CUSTOM_SETS_KEY } from '../db';
import { QuizSession } from '../components/QuizSession';
import { ExamLaunchButton } from '../components/ExamLaunchButton';
import { AdvancedSearchInput } from '../components/SearchHelperDropdown';
import { HighlightText } from '../components/HighlightText';
import { useSearchQuery } from '../hooks/useSearchQuery';
import { toPlainText, type ParsedQuery, type SearchMatch } from '../services/searchEngine';
import { customSetKey } from '../services/examService';
import { topicLabel } from '../services/topicColors';
import type { QuestionData } from '../db/schema';
import { useStore } from '../store/useStore';

const PAGE_SIZES = [25, 50, 100] as const;
/** Planning estimate shown in the summary bar */
const MINUTES_PER_QUESTION = 1.5;

const selectClass =
  'w-full min-h-[40px] rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-sm text-on-surface focus:border-primary focus:outline-none cursor-pointer';

const FilterLabel: React.FC<{ htmlFor?: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
  <label htmlFor={htmlFor} className="text-xs font-semibold text-on-surface-variant">
    {children}
  </label>
);

/** Page numbers to show: first, last, and a window around the current page */
const pageWindow = (page: number, pages: number): Array<number | 'gap'> => {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: Array<number | 'gap'> = [];
  let last = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - last > 1) out.push('gap');
    out.push(p);
    last = p;
  }
  return out;
};

export const QuizCustom: React.FC = () => {
  const { hideAnswersInCustomQuiz, setHideAnswersInCustomQuiz } = useStore();
  const [allQuestions, setAllQuestions] = useState<QuestionData[]>([]);
  const [attemptedMap, setAttemptedMap] = useState<Record<string, boolean>>({});
  // A Set, so selections survive paging and filter changes
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedSets, setSavedSets] = useState<Record<string, string[]>>({});
  const [newSetName, setNewSetName] = useState<string>('');

  // Filters for question table
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unanswered' | 'answered'>('all');
  const [kindFilter, setKindFilter] = useState<QuestionKindFilter>('all');
  const [frequentOnly, setFrequentOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);

  // Quiz session state
  const [quizQuestions, setQuizQuestions] = useState<QuestionData[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const qMap = await QuestionsService.loadAllQuestions();
        setAllQuestions(QuestionsService.sortQuestionsStrict(Object.values(qMap)));

        const attempts = await db.attempts.toArray();
        const aMap: Record<string, boolean> = {};
        for (const a of attempts) {
          aMap[a.questionId] = true;
        }
        setAttemptedMap(aMap);

        const saved = localStorage.getItem(CUSTOM_SETS_KEY);
        if (saved) {
          setSavedSets(JSON.parse(saved));
        }
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const years = useMemo(() => Array.from(new Set(allQuestions.map((q) => q.year))).sort().reverse(), [allQuestions]);
  const topics = useMemo(() => Array.from(new Set(allQuestions.flatMap((q) => q.topics || []))).sort(), [allQuestions]);

  const scopedQuestions = useMemo(() => {
    const filtered = allQuestions.filter((q) => {
      if (yearFilter !== 'all' && q.year !== yearFilter) return false;
      if (topicFilter !== 'all' && !q.topics?.includes(topicFilter)) return false;
      if (statusFilter === 'unanswered' && attemptedMap[q.id]) return false;
      if (statusFilter === 'answered' && !attemptedMap[q.id]) return false;
      return true;
    });
    const byKind = QuestionsService.filterByKind(filtered, kindFilter);
    return frequentOnly ? QuestionsService.filterFrequentlyTested(byKind) : byKind;
  }, [allQuestions, yearFilter, topicFilter, statusFilter, attemptedMap, kindFilter, frequentOnly]);

  const { input: search, setInput: setSearch, parsed, matches } = useSearchQuery(scopedQuestions);

  const filteredQuestions = useMemo(
    () => (matches ? matches.map((m) => m.question) : scopedQuestions),
    [matches, scopedQuestions]
  );
  const matchById = useMemo(
    () => new Map<string, SearchMatch>(matches?.map((m) => [m.question.id, m]) ?? []),
    [matches]
  );

  // Any filter change starts from the first page
  useEffect(() => setPage(1), [filteredQuestions, pageSize]);

  const pages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const safePage = Math.min(page, pages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = filteredQuestions.slice(pageStart, pageStart + pageSize);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((q) => selectedIds.has(q.id));
  const filteredAllSelected = filteredQuestions.length > 0 && filteredQuestions.every((q) => selectedIds.has(q.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addAll = (list: QuestionData[]) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((q) => next.add(q.id));
      return next;
    });

  const removeAll = (list: QuestionData[]) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((q) => next.delete(q.id));
      return next;
    });

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const clearFilters = () => {
    setYearFilter('all');
    setTopicFilter('all');
    setStatusFilter('all');
    setKindFilter('all');
    setFrequentOnly(false);
    setSearch('');
  };

  const handleSaveSet = () => {
    if (!newSetName.trim() || selectedIds.size === 0) return;
    const updated = {
      ...savedSets,
      [newSetName.trim()]: Array.from(selectedIds),
    };
    setSavedSets(updated);
    localStorage.setItem(CUSTOM_SETS_KEY, JSON.stringify(updated));
    setNewSetName('');
  };

  const handleDeleteSet = (name: string) => {
    const updated = { ...savedSets };
    delete updated[name];
    setSavedSets(updated);
    localStorage.setItem(CUSTOM_SETS_KEY, JSON.stringify(updated));
  };

  const handleLoadSet = (name: string) => {
    const ids = savedSets[name];
    if (ids) {
      setSelectedIds(new Set(ids));
    }
  };

  // In exam order, whatever order they were picked in
  const selectedList = useMemo(() => allQuestions.filter((q) => selectedIds.has(q.id)), [allQuestions, selectedIds]);

  // View 1: Active Custom Quiz View
  if (quizQuestions) {
    return (
      <QuizSession
        questions={quizQuestions}
        sessionType="custom"
        filterKey={customSetKey(quizQuestions.map((q) => q.id))}
        title={`Custom set (${quizQuestions.length} questions)`}
        exitLabel="Exit to Custom Builder"
        onExit={() => setQuizQuestions(null)}
        hideAnswers={hideAnswersInCustomQuiz}
      />
    );
  }

  const filtersActive =
    yearFilter !== 'all' || topicFilter !== 'all' || statusFilter !== 'all' || kindFilter !== 'all' || frequentOnly || !!search.trim();
  const estMinutes = Math.round(selectedIds.size * MINUTES_PER_QUESTION);

  // View 2: Custom Problem Sets Builder
  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-32 flex flex-col gap-6 animate-in fade-in duration-300">
      <header className="flex flex-col gap-1.5 max-w-2xl">
        <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">Custom Builder</h1>
        <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
          Filter the question bank, pick what you want, then practice it or take it as a timed exam. Selections stay while you
          page and change filters.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-6 items-start">
        {/* Filters */}
        <aside className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 lg:sticky lg:top-20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-on-surface">Filters</h2>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline underline-offset-2 cursor-pointer">
                Clear all
              </button>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <FilterLabel htmlFor="cb-year">Year</FilterLabel>
            <select id="cb-year" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={selectClass}>
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <FilterLabel htmlFor="cb-topic">Topic</FilterLabel>
            <select id="cb-topic" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className={selectClass}>
              <option value="all">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {topicLabel(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <FilterLabel htmlFor="cb-status">Status</FilterLabel>
            <select
              id="cb-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className={selectClass}
            >
              <option value="all">All questions</option>
              <option value="unanswered">Not answered yet</option>
              <option value="answered">Answered before</option>
            </select>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-on-surface-variant">Question type</legend>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-container p-1">
              {(
                [
                  ['all', 'All'],
                  ['recall', 'Recall'],
                  ['solving', 'Solving'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kindFilter === value}
                  onClick={() => setKindFilter(value)}
                  className={`tap min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    kindFilter === value ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-on-surface-variant">
              Recall: answered from knowledge. Solving: calculation, tracing or code.
            </p>
          </fieldset>

          <SwitchRow
            id="cb-frequent"
            label="Frequently tested only"
            hint="Asked in 2+ exam years, most repeated first"
            on={frequentOnly}
            onChange={setFrequentOnly}
          />

          <div className="border-t border-outline-variant/20 pt-4">
            <SwitchRow
              id="cb-reveal"
              label="Reveal answers after each question"
              hint={
                hideAnswersInCustomQuiz
                  ? 'Off: you see right or wrong, and the explanation stays folded until you open it.'
                  : 'On: the explanation opens as soon as you submit.'
              }
              on={!hideAnswersInCustomQuiz}
              onChange={(on) => setHideAnswersInCustomQuiz(!on)}
            />
          </div>

          {Object.keys(savedSets).length > 0 && (
            <div className="flex flex-col gap-2 border-t border-outline-variant/20 pt-4">
              <h3 className="text-xs font-semibold text-on-surface-variant">Saved presets</h3>
              <ul className="flex flex-col gap-1">
                {Object.entries(savedSets).map(([setName, qIds]) => (
                  <li key={setName} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleLoadSet(setName)}
                      className="tap flex-1 min-h-[36px] truncate rounded-lg px-2 text-left text-sm text-on-surface hover:bg-surface-container cursor-pointer"
                      title={`Select the ${qIds.length} questions in "${setName}"`}
                    >
                      {setName} <span className="text-on-surface-variant tabular-nums">({qIds.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSet(setName)}
                      aria-label={`Delete preset ${setName}`}
                      className="tap flex h-9 w-9 items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Results */}
        <section className="flex flex-col gap-3 min-w-0" aria-labelledby="cb-results">
          <AdvancedSearchInput value={search} onChange={setSearch} parsed={parsed} hasResults={!!matches && matches.length > 0} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="cb-results" className="text-sm text-on-surface tabular-nums" aria-live="polite">
              <span className="font-bold">{filteredQuestions.length.toLocaleString()}</span> questions
              {selectedIds.size > 0 && <span className="text-on-surface-variant"> · {selectedIds.size.toLocaleString()} selected</span>}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => (pageAllSelected ? removeAll(pageRows) : addAll(pageRows))}
                disabled={pageRows.length === 0}
                className="tap min-h-[36px] rounded-lg border border-outline-variant/30 px-3 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 cursor-pointer"
              >
                {pageAllSelected ? 'Unselect page' : `Select page (${pageRows.length})`}
              </button>
              <button
                type="button"
                onClick={() => (filteredAllSelected ? removeAll(filteredQuestions) : addAll(filteredQuestions))}
                disabled={filteredQuestions.length === 0}
                className="tap min-h-[36px] rounded-lg border border-outline-variant/30 px-3 text-xs font-semibold text-on-surface hover:bg-surface-container disabled:opacity-40 cursor-pointer"
              >
                {filteredAllSelected ? 'Unselect all results' : `Select all results (${filteredQuestions.length.toLocaleString()})`}
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low">
            {loading ? (
              <p className="py-16 text-center font-mono-code text-sm text-on-surface-variant">Loading the question bank…</p>
            ) : filteredQuestions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant" aria-hidden="true">filter_alt_off</span>
                <p className="text-sm font-semibold text-on-surface">No questions match these filters</p>
                <p className="max-w-sm text-sm text-on-surface-variant">
                  {matches && matches.length === 0 ? 'Try fewer words or drop the quotes in the search.' : 'Widen the year, topic or type filters.'}
                </p>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="press-scale min-h-[40px] rounded-lg bg-surface-container-high px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-container text-xs text-on-surface-variant border-b border-outline-variant/20">
                    <tr>
                      <th className="w-12 px-4 py-3 text-center font-semibold">
                        <span className="sr-only">Selected</span>
                      </th>
                      <th className="px-3 py-3 font-semibold">Question</th>
                      <th className="px-3 py-3 font-semibold">Topic</th>
                      <th className="hidden md:table-cell px-3 py-3 font-semibold">Type</th>
                      <th className="px-3 py-3 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/10 text-on-surface">
                    {pageRows.map((q, rowIndex) => {
                      const isSelected = selectedIds.has(q.id);
                      const isAnswered = attemptedMap[q.id];
                      const match = matchById.get(q.id);

                      return (
                        <tr
                          key={q.id}
                          onClick={() => toggleSelect(q.id)}
                          className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/8' : 'hover:bg-surface-container/60'}`}
                        >
                          <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(q.id)}
                              aria-label={`Select ${q.id}`}
                              className="h-4 w-4 rounded accent-primary cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-3 max-w-md">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="font-mono-code text-xs font-bold text-primary">
                                {match ? <HighlightText text={q.id} query={parsed} /> : q.id}
                              </span>
                              {match ? (
                                <SearchMatchCell match={match} parsed={parsed} isBest={parsed.isPastedQuestion && safePage === 1 && rowIndex === 0} />
                              ) : (
                                <span className="truncate text-on-surface-variant">
                                  {q.question ? toPlainText(q.question).slice(0, 110) || '(Diagram question)' : '(Diagram question)'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="whitespace-nowrap rounded bg-surface-container-high px-2 py-0.5 text-xs text-tertiary">
                              {topicLabel(q.topics?.[0] || 'software')}
                            </span>
                          </td>
                          <td className="hidden md:table-cell px-3 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                            {q.kind === 'solving' ? 'Solving' : 'Recall'}
                            {(q.repeat_count ?? 1) >= 2 && (
                              <span className="ml-1.5 text-confidence-amber" title={`Asked in ${q.repeat_count} exam years`}>
                                · {q.repeat_count}×
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {isAnswered ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-mastery-emerald/15 px-2 py-0.5 text-[11px] font-semibold text-mastery-emerald">
                                <span className="h-1.5 w-1.5 rounded-full bg-mastery-emerald" aria-hidden="true" />
                                Attempted
                              </span>
                            ) : (
                              <span className="text-[11px] text-on-surface-variant">Not yet</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {filteredQuestions.length > 0 && (
              <nav
                aria-label="Question pages"
                className="flex flex-col gap-3 border-t border-outline-variant/20 bg-surface-container-lowest/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3 text-xs text-on-surface-variant tabular-nums">
                  <span>
                    Showing {(pageStart + 1).toLocaleString()}–{Math.min(pageStart + pageSize, filteredQuestions.length).toLocaleString()} of{' '}
                    {filteredQuestions.length.toLocaleString()}
                  </span>
                  <label className="flex items-center gap-1.5">
                    <span>Per page</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
                      className="tap min-h-[32px] rounded-lg border border-outline-variant/30 bg-surface-container-low px-2 text-xs text-on-surface cursor-pointer"
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPage(safePage - 1)}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                    className="tap flex h-9 w-9 items-center justify-center rounded-lg text-on-surface hover:bg-surface-container disabled:opacity-30 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_left</span>
                  </button>
                  {pageWindow(safePage, pages).map((p, i) =>
                    p === 'gap' ? (
                      <span key={`gap-${i}`} className="px-1 text-xs text-on-surface-variant" aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        aria-current={p === safePage ? 'page' : undefined}
                        className={`tap h-9 min-w-9 rounded-lg px-2 text-xs font-semibold tabular-nums cursor-pointer ${
                          p === safePage ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => setPage(safePage + 1)}
                    disabled={safePage >= pages}
                    aria-label="Next page"
                    className="tap flex h-9 w-9 items-center justify-center rounded-lg text-on-surface hover:bg-surface-container disabled:opacity-30 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
                  </button>
                </div>
              </nav>
            )}
          </div>
        </section>
      </div>

      {/* Summary bar: what is selected and how to run it */}
      {selectedIds.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3 sm:px-6 lg:px-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3 text-sm text-on-surface tabular-nums">
              <span>
                <span className="font-bold">{selectedIds.size.toLocaleString()}</span> selected · ~{estMinutes} min
              </span>
              <button type="button" onClick={clearSelection} className="text-xs font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer">
                Clear
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveSet();
                }}
              >
                <input
                  type="text"
                  placeholder="Preset name"
                  aria-label="Preset name"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  className="min-h-[40px] w-36 sm:w-44 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newSetName.trim()}
                  className="min-h-[40px] rounded-lg bg-surface-container-high px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40 cursor-pointer"
                >
                  Save preset
                </button>
              </form>
              <ExamLaunchButton
                questions={selectedList}
                setKey={customSetKey(selectedList.map((q) => q.id))}
                title={`Custom set (${selectedList.length} questions)`}
                sessionType="custom"
                filterKey={customSetKey(selectedList.map((q) => q.id))}
              />
              <button
                type="button"
                onClick={() => setQuizQuestions(selectedList)}
                className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl bg-primary px-5 text-sm font-body-bold text-on-primary shadow-lg hover:bg-primary-fixed-dim cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
                Start practice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SwitchRow: React.FC<{ id: string; label: string; hint: string; on: boolean; onChange: (v: boolean) => void }> = ({
  id,
  label,
  hint,
  on,
  onChange,
}) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-sm font-semibold text-on-surface cursor-pointer">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-[11px] leading-snug text-on-surface-variant">
        {hint}
      </p>
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby={`${id}-hint`}
      onClick={() => onChange(!on)}
      className={`tap-area relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${
        on ? 'bg-primary' : 'bg-surface-container-highest ring-1 ring-inset ring-outline'
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${
          on ? 'translate-x-[22px] bg-on-primary' : 'translate-x-0.5 bg-on-surface-variant'
        }`}
        aria-hidden="true"
      />
    </button>
  </div>
);

const FIELD_LABEL: Record<SearchMatch['field'], string> = {
  question: 'stem',
  option: 'option',
  explanation: 'explanation',
  id: 'item ID',
  topic: 'topic',
};

const SearchMatchCell: React.FC<{
  match: SearchMatch;
  parsed: ParsedQuery;
  isBest: boolean;
}> = ({ match, parsed, isBest }) => {
  const stem = toPlainText(match.question.question) || '(Schematic Diagram Question)';
  const showField = match.field === 'option' || match.field === 'explanation';

  return (
    <div className="flex flex-col gap-1 text-on-surface-variant">
      <div className="line-clamp-2 whitespace-normal leading-relaxed">
        <HighlightText text={stem} query={parsed} excerptRadius={70} />
      </div>
      {showField && (
        <div className="line-clamp-1 whitespace-normal text-[11px] text-on-surface-variant/80">
          <span className="search-hint-subtitle font-semibold uppercase">
            {match.field === 'option' ? `Option ${match.optionKey?.toUpperCase()}` : FIELD_LABEL[match.field]}:{' '}
          </span>
          <HighlightText text={match.fieldText} query={parsed} excerptRadius={60} />
        </div>
      )}
      {parsed.isPastedQuestion && (
        <div className="flex items-center gap-1.5">
          {isBest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-mastery-emerald/15 px-2 py-0.5 text-[10px] font-semibold text-mastery-emerald">
              <span className="material-symbols-outlined text-[12px]">target</span>
              Best match
            </span>
          )}
          <span className="text-[10px] text-on-surface-variant/70">{Math.round(match.score * 100)}% similar</span>
        </div>
      )}
    </div>
  );
};

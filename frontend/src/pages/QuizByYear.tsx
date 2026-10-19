import React, { useState, useEffect, useRef } from 'react';
import { QuestionsService, type ExamSession } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { db } from '../db';
import { QuizSession } from '../components/QuizSession';
import { ExamLaunchButton } from '../components/ExamLaunchButton';
import { YearStatsPanel } from '../components/YearStatsPanel';
import { AnalyticsEngine } from '../services/analyticsEngine';

// Sitting length per paper: Subject A (FE-A) 90 min, Subject B (FE-B) 100 min; legacy AM/PM papers ran 150 min.
const paperMinutes = (sess: ExamSession) => {
  if (sess.paper === 'FE-A') return 90;
  if (sess.paper === 'FE-B') return 100;
  return 150;
};
import type { QuestionData } from '../db/schema';

export const QuizByYear: React.FC = () => {
  const [years, setYears] = useState<string[]>([]);
  const [yearCounts, setYearCounts] = useState<Record<string, number>>({});
  const [selectedYear, setSelectedYear] = useState<string | null>('2024');
  // Real accuracy per year from this device's attempts (null = nothing answered in that year yet)
  const [yearAccuracy, setYearAccuracy] = useState<Record<string, number | null>>({});

  useEffect(() => {
    AnalyticsEngine.getCompletionRates()
      .then(({ byYear }) =>
        setYearAccuracy(Object.fromEntries(byYear.map((y) => [y.year, y.attempted > 0 ? y.accuracyPercent : null])))
      )
      .catch(() => {});
  }, []);

  // Strip scrolling, dragging, and view mode state
  const stripRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'strip' | 'grid'>('strip');
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const [startX, setStartX] = useState<number>(0);
  const [scrollLeftState, setScrollLeftState] = useState<number>(0);
  const [draggedDistance, setDraggedDistance] = useState<number>(0);

  // Available sessions for the selected year
  const [yearSessions, setYearSessions] = useState<ExamSession[]>([]);
  const [allYearQuestions, setAllYearQuestions] = useState<QuestionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');

  // Track which session cards have "See all numbers" expanded
  const [statsOpen, setStatsOpen] = useState(false);
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());

  // Attempt history status map: questionId -> { isCorrect: boolean }
  const [attemptStatusMap, setAttemptStatusMap] = useState<Record<string, { isCorrect: boolean }>>({});

  // Active quiz view state
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);

  // Load years on mount
  useEffect(() => {
    const loadYears = async () => {
      try {
        const meta = await QuestionsService.loadMetadataSummary();
        const yList = meta.years || [];
        setYears(yList);
        setYearCounts(meta.year_counts || {});
        if (yList.length > 0 && !selectedYear) {
          handleSelectYear(yList[0]);
        } else if (selectedYear) {
          handleSelectYear(selectedYear);
        }
      } catch (err) {
        console.error('Failed to load years:', err);
      } finally {
        setLoading(false);
      }
    };
    loadYears();
  }, []);

  // Wheel listener to convert vertical mouse wheel into horizontal scroll
  useEffect(() => {
    const el = stripRef.current;
    if (!el || viewMode !== 'strip') return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [viewMode, years]);

  const scrollStrip = (direction: 'left' | 'right') => {
    if (!stripRef.current) return;
    const step = 420;
    stripRef.current.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!stripRef.current) return;
    setIsMouseDown(true);
    setDraggedDistance(0);
    setStartX(e.pageX - stripRef.current.offsetLeft);
    setScrollLeftState(stripRef.current.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !stripRef.current) return;
    e.preventDefault();
    const x = e.pageX - stripRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    setDraggedDistance(Math.abs(walk));
    stripRef.current.scrollLeft = scrollLeftState - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
  };

  const handleJumpEpoch = (targetYear: string) => {
    handleSelectYear(targetYear);
    if (stripRef.current) {
      const idx = years.indexOf(targetYear);
      if (idx !== -1) {
        stripRef.current.scrollTo({
          left: Math.max(0, idx * 154 - 60),
          behavior: 'smooth',
        });
      }
    }
  };

  // When a year is selected, load its sessions, all questions, and attempt history
  const handleSelectYear = async (year: string) => {
    setSelectedYear(year);
    setSelectedSessionId('all');
    setIsQuizActive(false);
    setLoading(true);

    try {
      const [sessions, qList, attempts] = await Promise.all([
        QuestionsService.getSessionsForYear(year),
        QuestionsService.getQuestionsByYear(year, 'all'),
        db.attempts.toArray(),
      ]);

      setYearSessions(sessions);
      setAllYearQuestions(qList);

      const aMap: Record<string, { isCorrect: boolean }> = {};
      for (const a of attempts) {
        aMap[a.questionId] = { isCorrect: a.isCorrect };
      }
      setAttemptStatusMap(aMap);
    } catch (err) {
      console.error('Failed to load sessions for year:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpandedSession = (sessionId: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const handleStartSession = async (
    sessionId: string = 'all',
    initialIndex: number = 0,
    year: string | null = selectedYear
  ) => {
    if (!year) return;
    setSelectedSessionId(sessionId);
    setLoading(true);

    try {
      const qList = await QuestionsService.getQuestionsByYear(year, sessionId);
      setQuestions(qList);
      const safeIndex = Math.max(0, Math.min(initialIndex, qList.length - 1));
      setCurrentIndex(safeIndex);
      setIsQuizActive(true);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Surprise pick: any single paper (one year + season + subject) from the whole archive
  const [pickingRandom, setPickingRandom] = useState(false);
  const handleRandomPaper = async () => {
    if (pickingRandom || years.length === 0) return;
    setPickingRandom(true);
    try {
      const meta = await QuestionsService.loadMetadataSummary();
      const pool: Array<{ year: string; sessionId: string }> = [];
      for (const y of years) {
        const sessions: ExamSession[] = meta.sessions_by_year?.[y] ?? (await QuestionsService.getSessionsForYear(y));
        for (const sess of sessions) {
          if (sess.question_count > 0) pool.push({ year: y, sessionId: sess.session_id });
        }
      }
      if (pool.length === 0) return;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      // Select the year first so exiting the quiz lands on that paper's year
      await handleSelectYear(pick.year);
      await handleStartSession(pick.sessionId, 0, pick.year);
    } catch (err) {
      console.error('Failed to pick a random paper:', err);
    } finally {
      setPickingRandom(false);
    }
  };

  // Helper to render question number buttons
  const renderNumberGrid = (qList: QuestionData[], targetSessionId: string) => {
    return (
      <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5 p-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-inner animate-in fade-in duration-150">
        {qList.map((q, qIdx) => {
          const status = attemptStatusMap[q.id];
          const isCurr = isQuizActive && currentIndex === qIdx;
          const label = q.sub_number ? `${q.number}.${q.sub_number}` : `${q.number}`;

          let colorClasses =
            'bg-surface-container-low text-on-surface-variant hover:bg-surface-container border border-outline-variant/20';

          if (isCurr) {
            colorClasses = 'bg-primary text-on-primary font-bold shadow-md scale-105 z-10';
          } else if (status) {
            if (status.isCorrect) {
              colorClasses = 'bg-mastery-emerald/15 text-mastery-emerald hover:bg-mastery-emerald/25 border border-mastery-emerald/20';
            } else {
              colorClasses = 'bg-error/20 text-error hover:bg-error/30 border border-error/20';
            }
          }

          return (
            <button
              key={q.id}
              onClick={(e) => {
                e.stopPropagation();
                if (isQuizActive) {
                  setCurrentIndex(qIdx);
                } else {
                  handleStartSession(targetSessionId, qIdx);
                }
              }}
              className={`flex h-8 items-center justify-center rounded font-mono-code text-xs font-semibold transition-all active:scale-95 cursor-pointer ${colorClasses}`}
              title={`Question ${label} (${q.id})${
                status ? (status.isCorrect ? ' • Correct' : ' • Incorrect') : ' • Unattempted'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  // View 1: Active Quiz Interface
  if (isQuizActive) {
    const activeSessionTitle =
      selectedSessionId === 'all'
        ? `Full ${selectedYear} Mock Exam`
        : yearSessions.find((s) => s.session_id === selectedSessionId)?.session_title || selectedYear;

    return (
      <QuizSession
        key={`${selectedYear}:${selectedSessionId}`}
        questions={questions}
        initialIndex={currentIndex}
        sessionType="year"
        filterKey={`${selectedYear}:${selectedSessionId}`}
        title={`${selectedYear} · ${activeSessionTitle}`}
        exitLabel={`Exit to Year Papers (${activeSessionTitle})`}
        onExit={() => setIsQuizActive(false)}
        attemptStatusMap={attemptStatusMap}
        onAttempt={(id, isCorrect) => setAttemptStatusMap((prev) => ({ ...prev, [id]: { isCorrect } }))}
        withMockScore
      />
    );
  }

  // View 2: Archival Catalog & Session Selector (2007 - 2026)
  const isMockExpanded = expandedSessionIds.has('all');

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 animate-in fade-in duration-300">
      {/* Top Telemetry & Session Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
        <div className="flex flex-col gap-2 max-w-2xl">
          <div className="flex items-center gap-2 font-mono-timer text-xs text-tertiary">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-interactive-sky" />
            <span>PHILNITS ARCHIVAL REPOSITORY // EXAM_CATALOG: 2007-2026</span>
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-display-lg text-4xl sm:text-5xl font-bold text-on-surface tracking-tight">
              Year Papers
            </h1>
          </div>
          <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
            Every PhilNITS FE past paper from 2007 to 2026. Pick a year, then practice one paper or the whole year.
          </p>
        </div>

        <div className="flex flex-col items-stretch md:items-end gap-3 shrink-0">
        <button
          type="button"
          onClick={handleRandomPaper}
          disabled={pickingRandom || years.length === 0}
          title="Start a random paper from any year"
          className="press-scale min-h-[40px] flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50 cursor-pointer"
        >
          <span className={`material-symbols-outlined text-[16px] ${pickingRandom ? 'animate-spin' : ''}`}>
            {pickingRandom ? 'progress_activity' : 'shuffle'}
          </span>
          <span>Random Paper</span>
        </button>
        {/* Quick Metrics Ribbon: opens the year's detailed progress */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 shadow-sm min-w-0 sm:shrink-0">
          <button
            type="button"
            onClick={() => setStatsOpen(true)}
            disabled={!selectedYear}
            className="press-scale flex w-full sm:w-auto justify-center min-h-[44px] items-center gap-1.5 rounded-lg bg-surface-container-high px-3 text-xs font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer"
            title="Accuracy, repeat traps, weak topics, time and trend for this year"
          >
            <span className="material-symbols-outlined text-[16px] text-primary" aria-hidden="true">insights</span>
            Year stats
          </button>
          <div className="hidden sm:block w-px h-8 bg-outline-variant/30" />
          <div className="flex flex-col px-2">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Year Accuracy</span>
            <span
              className={`font-mono-timer text-sm font-bold ${
                yearAccuracy[selectedYear ?? ''] == null ? 'text-on-surface-variant' : 'text-mastery-emerald'
              }`}
              title={yearAccuracy[selectedYear ?? ''] == null ? 'No answers in this year yet' : undefined}
            >
              {yearAccuracy[selectedYear ?? ''] == null ? '—' : `${yearAccuracy[selectedYear ?? '']}%`}
            </span>
          </div>
          <div className="hidden sm:block w-px h-8 bg-outline-variant/30" />
          <div className="flex flex-col px-2">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Questions Total</span>
            <span className="font-mono-timer text-sm text-on-surface font-bold">
              {yearCounts[selectedYear || '2024'] ? `${yearCounts[selectedYear || '2024']} Qs` : '160 Qs'}
            </span>
          </div>
          <div className="hidden sm:block w-px h-8 bg-outline-variant/30" />
          <div className="flex flex-col px-2">
            <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">Sim Mode</span>
            <span className="font-mono-timer text-sm text-interactive-sky font-bold">OFFLINE-STRICT</span>
          </div>
        </div>
        </div>
      </div>

      {/* 1. Year Archive Selector Section */}
      <div className="flex flex-col gap-3">
        {/* Navigation & Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-label-caps text-xs text-on-surface uppercase tracking-wider font-bold">
              Exam Cadence Chronology (2026 – 2007)
            </span>
            <span className="font-mono-timer text-[11px] text-tertiary px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30">
              {years.length} Cycles Available
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Era Jump Filters */}
            <div className="hidden md:flex items-center gap-1 font-mono-code text-[11px]">
              <button
                type="button"
                onClick={() => handleJumpEpoch('2026')}
                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                2024–2026
              </button>
              <button
                type="button"
                onClick={() => handleJumpEpoch('2023')}
                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                2018–2023
              </button>
              <button
                type="button"
                onClick={() => handleJumpEpoch('2017')}
                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                2012–2017
              </button>
              <button
                type="button"
                onClick={() => handleJumpEpoch('2011')}
                className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
              >
                2007–2011
              </button>
            </div>

            <div className="h-4 w-px bg-outline-variant/30 hidden md:block" />

            {/* Left / Right Scroll Arrows (when in strip mode) */}
            {viewMode === 'strip' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => scrollStrip('left')}
                  className="w-8 h-8 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-primary/40 active:scale-95 transition-all cursor-pointer shadow-sm"
                  title="Scroll to earlier years (towards 2026)"
                >
                  <span className="material-symbols-outlined text-base">chevron_left</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollStrip('right')}
                  className="w-8 h-8 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container hover:border-primary/40 active:scale-95 transition-all cursor-pointer shadow-sm"
                  title="Scroll to older archives (towards 2007)"
                >
                  <span className="material-symbols-outlined text-base">chevron_right</span>
                </button>
              </div>
            )}

            {/* View Mode Toggle: Strip vs Full Grid */}
            <div className="flex items-center p-0.5 rounded-lg bg-surface-container border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setViewMode('strip')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono-code font-medium transition-all cursor-pointer ${
                  viewMode === 'strip'
                    ? 'bg-surface-container-highest text-primary shadow-sm font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Movable horizontal strip view"
              >
                <span className="material-symbols-outlined text-[15px]">view_carousel</span>
                <span className="hidden sm:inline">Strip</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono-code font-medium transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-surface-container-highest text-primary shadow-sm font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
                title="Show all 20 years at once in a grid"
              >
                <span className="material-symbols-outlined text-[15px]">grid_view</span>
                <span className="hidden sm:inline">All Grid</span>
              </button>
            </div>
          </div>
        </div>

        {/* View Mode 1: Movable, Scrollable, Draggable Horizontal Strip */}
        {viewMode === 'strip' ? (
          <div className="flex flex-col gap-1.5">
            <div
              ref={stripRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              className={`flex gap-2.5 overflow-x-auto pb-3 pt-1 styled-horizontal-scrollbar snap-x select-none transition-cursor ${
                isMouseDown ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              {years.map((year) => {
                const count = yearCounts[year] || 0;
                const isSelected = selectedYear === year;
                const isNewFormat = parseInt(year, 10) >= 2023;

                return (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      if (draggedDistance < 6) {
                        handleSelectYear(year);
                      }
                    }}
                    className={`group shrink-0 snap-start flex flex-col justify-between w-36 p-4 rounded-xl text-left transition-all border ${
                      isSelected
                        ? 'bg-surface-container-high border-primary/50 shadow-lg ring-1 ring-primary/40 relative overflow-hidden'
                        : 'bg-surface-container-low border-outline-variant/20 hover:bg-surface-container hover:border-outline-variant/40'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-0 right-0 w-10 h-10 bg-primary/10 rounded-bl-full flex items-start justify-end p-1">
                        <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between w-full">
                      <span className={`font-title-sm text-lg font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                        {year}
                      </span>
                      <span className="font-label-caps text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-tertiary">
                        {isNewFormat ? 'FE-A/B' : 'AM/PM'}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-0.5">
                      <span className="font-mono-timer text-xs text-on-surface-variant">{count} Items</span>
                      <span
                        className={`font-label-caps text-[10px] ${
                          isSelected
                            ? 'text-primary font-bold'
                            : isNewFormat
                            ? 'text-confidence-amber'
                            : 'text-on-surface-variant'
                        }`}
                      >
                        {isSelected ? 'ACTIVE CYCLE' : isNewFormat ? 'CBT Verified' : 'Archived'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono-code text-on-surface-variant/70 px-1">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs text-primary">touch_app</span>
                <span>Click & drag horizontally, scroll mouse wheel, or use arrows to view all papers (2007–2026)</span>
              </span>
              <span className="hidden sm:inline">2007 ↔ 2026</span>
            </div>
          </div>
        ) : (
          /* View Mode 2: Responsive Full Grid (All 20 Years Visible at Once) */
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2.5 pt-1 animate-in fade-in duration-200">
            {years.map((year) => {
              const count = yearCounts[year] || 0;
              const isSelected = selectedYear === year;
              const isNewFormat = parseInt(year, 10) >= 2023;

              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleSelectYear(year)}
                  className={`group flex flex-col justify-between p-3 rounded-xl text-left transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-surface-container-high border-primary/50 shadow-md ring-1 ring-primary/40 relative overflow-hidden'
                      : 'bg-surface-container-low border-outline-variant/20 hover:bg-surface-container hover:border-outline-variant/40'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-0 right-0 w-8 h-8 bg-primary/10 rounded-bl-full flex items-start justify-end p-0.5">
                      <span className="material-symbols-outlined text-primary text-[12px]">check_circle</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between w-full">
                    <span className={`font-title-sm text-base font-bold ${isSelected ? 'text-primary' : 'text-on-surface'}`}>
                      {year}
                    </span>
                    <span className="font-label-caps text-[10px] px-1 py-0.5 rounded bg-surface-container-highest text-tertiary">
                      {isNewFormat ? 'FE' : 'AP'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-col gap-0.5">
                    <span className="font-mono-timer text-[11px] text-on-surface-variant">{count} Qs</span>
                    <span
                      className={`font-label-caps text-[10px] truncate ${
                        isSelected
                          ? 'text-primary font-bold'
                          : isNewFormat
                          ? 'text-confidence-amber'
                          : 'text-on-surface-variant'
                      }`}
                    >
                      {isSelected ? 'ACTIVE' : isNewFormat ? 'CBT' : 'Archive'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Active Year Details View */}
      {selectedYear && (
        <div className="flex flex-col gap-6">
          {/* Individual Exam Session Cards (Spring vs Autumn) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {yearSessions.map((sess) => {
              const isSpring = sess.season === 'S';
              const isExpanded = expandedSessionIds.has(sess.session_id);
              const sessionQuestions = allYearQuestions.filter((q) => q.session_id === sess.session_id);

              return (
                <div
                  key={sess.session_id}
                  className="rounded-xl bg-surface-container-low p-6 shadow-sm flex flex-col justify-between border border-outline-variant/30 hover:border-outline-variant/50 transition-all"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`material-symbols-outlined text-[20px] ${isSpring ? 'text-pink-600 dark:text-pink-300' : 'text-confidence-amber'}`}
                          aria-hidden="true"
                        >
                          {isSpring ? 'local_florist' : 'eco'}
                        </span>
                        <span className="font-title-sm text-base font-bold text-on-surface">
                          {sess.session_title}
                        </span>
                      </div>
                      <span className="font-label-caps text-xs px-2.5 py-0.5 rounded bg-surface-container-highest text-tertiary font-bold">
                        {sess.question_count} Items
                      </span>
                    </div>

                    <p className="font-body-base text-xs text-on-surface-variant leading-relaxed">
                      Questions {sess.first_q} through {sess.last_q} in official PHILNITS exam sequence.
                    </p>

                    {/* Progress indicator */}
                    <div className="mt-2 flex flex-col gap-1.5">
                      <div className="flex justify-between font-mono-timer text-xs text-on-surface-variant">
                        <span>Paper Coverage: {sessionQuestions.length} Questions</span>
                        <span className="text-mastery-emerald font-bold">{paperMinutes(sess)} min exam</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                        <div className="bg-primary h-full rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-outline-variant/20 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpandedSession(sess.session_id)}
                        className="flex items-center gap-1 text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px] text-primary">tag</span>
                        <span>{isExpanded ? 'Hide numbers' : `See Q${sess.first_q}–Q${sess.last_q}`}</span>
                        <span className="material-symbols-outlined text-[15px]">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <ExamLaunchButton
                          compact
                          questions={sessionQuestions}
                          setKey={`year:${sess.session_id}`}
                          title={`${selectedYear} · ${sess.session_title}`}
                          sessionType="year"
                          filterKey={`${selectedYear}:${sess.session_id}`}
                          minutes={paperMinutes(sess)}
                        />
                        <button
                          type="button"
                          onClick={() => handleStartSession(sess.session_id, 0)}
                          className="min-h-[36px] px-4 py-2 rounded-lg bg-surface-container-high hover:bg-primary-container text-on-surface hover:text-on-primary font-body-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        >
                          <span>Practice Session</span>
                          <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-2 animate-in fade-in duration-150">
                        {renderNumberGrid(sessionQuestions, sess.session_id)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Comprehensive Mock Exam Banner */}
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-surface-container to-surface-container-low p-6 shadow-md border border-outline-variant/30">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="flex flex-col gap-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="font-label-caps text-xs px-2 py-0.5 rounded bg-primary-container text-on-primary-container uppercase font-bold">
                    Integrated Simulation Mode
                  </span>
                  <span className="font-mono-timer text-xs text-tertiary">TOTAL TIME: {yearSessions.reduce((t, x) => t + paperMinutes(x), 0)} MINS</span>
                </div>
                <h2 className="font-headline-md text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
                  {selectedYear} full-year mock exam
                </h2>
                <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
                  Every paper from this year back to back, in official question order. Use it as a full mock exam.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col">
                  <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
                    Available Corpus
                  </span>
                  <span className="font-mono-timer text-base text-mastery-emerald font-bold">
                    {allYearQuestions.length} Questions Verified
                  </span>
                </div>
                <ExamLaunchButton
                  questions={allYearQuestions}
                  setKey={`year:${selectedYear}:all`}
                  title={`${selectedYear} full-year mock exam`}
                  sessionType="year"
                  filterKey={`${selectedYear}:all`}
                  minutes={yearSessions.reduce((t, x) => t + paperMinutes(x), 0)}
                />
                <button
                  type="button"
                  onClick={() => handleStartSession('all', 0)}
                  className="h-11 px-6 rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-body-bold text-sm shadow-lg transition-transform active:scale-[0.98] flex items-center gap-2 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  <span>Practice Full Year ({allYearQuestions.length} Qs)</span>
                </button>
              </div>
            </div>

            {/* Toggle Full Year Numbers Drawer */}
            <div className="pt-4 mt-4 border-t border-outline-variant/20 relative z-10 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => toggleExpandedSession('all')}
                className="flex items-center gap-1.5 text-xs font-mono-code text-primary hover:underline cursor-pointer w-fit"
              >
                <span className="material-symbols-outlined text-[16px]">grid_view</span>
                <span>
                  {isMockExpanded ? 'Hide Paper Index Matrix' : `Inspect Full Year Matrix (1–${allYearQuestions.length})`}
                </span>
                <span className="material-symbols-outlined text-[16px] transition-transform">
                  {isMockExpanded ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {isMockExpanded && (
                <div className="pt-2 animate-in fade-in duration-150">
                  <p className="text-xs font-mono-code text-on-surface-variant mb-2">
                    Click any question cell to jump directly to that numbered item in official chronological order:
                  </p>
                  {renderNumberGrid(allYearQuestions, 'all')}
                </div>
              )}
            </div>

            {/* Ambient decorative line */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-interactive-sky to-tertiary opacity-30" />
          </div>
        </div>
      )}

      {statsOpen && selectedYear && <YearStatsPanel year={selectedYear} onClose={() => setStatsOpen(false)} />}
    </div>
  );
};

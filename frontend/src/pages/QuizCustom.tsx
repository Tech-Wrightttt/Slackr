import React, { useState, useEffect, useMemo } from 'react';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { db } from '../db';
import { QuestionCard } from '../components/QuestionCard';
import type { QuestionData, SRScheduleRecord } from '../db/schema';

export const QuizCustom: React.FC = () => {
  const [allQuestions, setAllQuestions] = useState<QuestionData[]>([]);
  const [attemptedMap, setAttemptedMap] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedSets, setSavedSets] = useState<Record<string, string[]>>({});
  const [newSetName, setNewSetName] = useState<string>('');

  // Filters for question table
  const [search, setSearch] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unanswered' | 'answered'>('all');

  // Quiz session state
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [quizQuestions, setQuizQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [sessionCompleted, setSessionCompleted] = useState<boolean>(false);
  const [sessionStats, setSessionStats] = useState<{
    correct: number;
    incorrect: number;
    totalTime: number;
  }>({ correct: 0, incorrect: 0, totalTime: 0 });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const qMap = await QuestionsService.loadAllQuestions();
        const list = Object.values(qMap);
        setAllQuestions(list);

        const attempts = await db.attempts.toArray();
        const aMap: Record<string, boolean> = {};
        for (const a of attempts) {
          aMap[a.questionId] = true;
        }
        setAttemptedMap(aMap);

        const saved = localStorage.getItem('slackr_custom_quiz_sets');
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

  const filteredQuestions = useMemo(() => {
    return allQuestions.filter((q) => {
      if (yearFilter !== 'all' && q.year !== yearFilter) return false;
      if (topicFilter !== 'all' && !q.topics?.includes(topicFilter)) return false;
      if (statusFilter === 'unanswered' && attemptedMap[q.id]) return false;
      if (statusFilter === 'answered' && !attemptedMap[q.id]) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          q.id.toLowerCase().includes(s) ||
          q.question.toLowerCase().includes(s) ||
          q.topics?.some((t) => t.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [allQuestions, yearFilter, topicFilter, statusFilter, search, attemptedMap]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredQuestions.slice(0, 100).forEach((q) => next.add(q.id));
    setSelectedIds(next);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleSaveSet = () => {
    if (!newSetName.trim() || selectedIds.size === 0) return;
    const updated = {
      ...savedSets,
      [newSetName.trim()]: Array.from(selectedIds),
    };
    setSavedSets(updated);
    localStorage.setItem('slackr_custom_quiz_sets', JSON.stringify(updated));
    setNewSetName('');
  };

  const handleDeleteSet = (name: string) => {
    const updated = { ...savedSets };
    delete updated[name];
    setSavedSets(updated);
    localStorage.setItem('slackr_custom_quiz_sets', JSON.stringify(updated));
  };

  const handleLoadSet = (name: string) => {
    const ids = savedSets[name];
    if (ids) {
      setSelectedIds(new Set(ids));
    }
  };

  const handleStartCustomQuiz = () => {
    if (selectedIds.size === 0) return;
    const selectedList = allQuestions.filter((q) => selectedIds.has(q.id));
    setQuizQuestions(selectedList);
    setCurrentIndex(0);
    setSessionCompleted(false);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });
    setIsQuizActive(true);
  };

  const handleAnswerSubmitted = async (
    questionId: string,
    topic: string,
    selectedAnswer: string,
    isCorrect: boolean,
    timeSeconds: number,
    confidence: number
  ): Promise<{ schedule: SRScheduleRecord }> => {
    const res = await StatsDbService.recordAttempt(
      questionId,
      topic,
      selectedAnswer,
      isCorrect,
      timeSeconds,
      confidence
    );

    setSessionStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      incorrect: prev.incorrect + (isCorrect ? 0 : 1),
      totalTime: prev.totalTime + timeSeconds,
    }));

    return { schedule: res.schedule };
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < quizQuestions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setSessionCompleted(true);
    }
  };

  const handleRestartQuiz = () => {
    setCurrentIndex(0);
    setSessionCompleted(false);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });
  };

  // View 1: Active Custom Quiz View
  if (isQuizActive) {
    const currentQ = quizQuestions[currentIndex];

    if (sessionCompleted) {
      const totalAnswered = sessionStats.correct + sessionStats.incorrect;
      const accuracy = totalAnswered > 0 ? Math.round((sessionStats.correct / totalAnswered) * 100) : 0;

      return (
        <div className="max-w-3xl mx-auto px-4 py-12 text-center animate-in fade-in duration-300">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-8 shadow-2xl flex flex-col gap-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-mastery-emerald/15 text-mastery-emerald border border-mastery-emerald/30">
              <span className="material-symbols-outlined text-4xl">emoji_events</span>
            </div>

            <div>
              <span className="font-label-caps text-xs text-primary uppercase tracking-widest font-bold">
                Custom Drill Completed
              </span>
              <h2 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface mt-1">
                Bespoke Set Finished
              </h2>
              <p className="mt-1 text-sm font-mono-code text-on-surface-variant">
                {quizQuestions.length} Items Selected
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 font-mono-code">
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
                <span className="text-xs text-on-surface-variant uppercase">Accuracy</span>
                <p className="mt-1 text-2xl font-bold text-mastery-emerald">{accuracy}%</p>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
                <span className="text-xs text-on-surface-variant uppercase">Score</span>
                <p className="mt-1 text-2xl font-bold text-on-surface">
                  {sessionStats.correct} / {totalAnswered}
                </p>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
                <span className="text-xs text-on-surface-variant uppercase">Total Time</span>
                <p className="mt-1 text-2xl font-bold text-interactive-sky">
                  {Math.round(sessionStats.totalTime)}s
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={handleRestartQuiz}
                className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-fixed-dim px-6 py-3 text-sm font-body-bold text-on-primary shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">replay</span>
                <span>Retry Set</span>
              </button>
              <button
                onClick={() => setIsQuizActive(false)}
                className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-6 py-3 text-sm font-body-bold text-on-surface hover:bg-surface-container-high transition-all active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                <span>Return to Builder</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
          <button
            onClick={() => setIsQuizActive(false)}
            className="flex items-center gap-1.5 text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Exit Custom Drill</span>
          </button>
          <span className="font-mono-code text-xs text-on-surface-variant">
            Question {currentIndex + 1} of {quizQuestions.length}
          </span>
        </div>

        {currentQ ? (
          <QuestionCard
            question={currentQ}
            questionNumber={currentIndex + 1}
            totalQuestions={quizQuestions.length}
            onAnswerSubmitted={handleAnswerSubmitted}
            onNextQuestion={handleNextQuestion}
            onPreviousQuestion={() => currentIndex > 0 && setCurrentIndex((p) => p - 1)}
            onSkipQuestion={handleNextQuestion}
            hasNext={currentIndex + 1 < quizQuestions.length}
            hasPrevious={currentIndex > 0}
            questions={quizQuestions}
            currentIndex={currentIndex}
            onSelectIndex={(idx) => setCurrentIndex(idx)}
          />
        ) : (
          <div className="py-20 text-center text-on-surface-variant font-mono-code text-sm">
            No questions staged in this set.
          </div>
        )}
      </div>
    );
  }

  // View 2: Custom Problem Sets Builder
  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Header & Staged Launch Ribbon */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
        <div className="flex flex-col gap-1 max-w-2xl">
          <div className="flex items-center gap-2 font-mono-timer text-xs text-badge-indigo">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-badge-indigo animate-ping" />
            <span>BESPOKE STAGING // DYNAMIC QUESTION WORKBENCH</span>
          </div>
          <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
            Custom Builder
          </h1>
          <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
            Assemble specialized problem sets: 20-minute rapid bursts, math-only calculations, or diagram-intensive
            schematics. Save and reload presets anytime.
          </p>
        </div>

        {/* Action Button & Staged Count */}
        <div className="flex items-center gap-3 shrink-0">
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-2 rounded-xl text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              Clear ({selectedIds.size})
            </button>
          )}

          <button
            type="button"
            onClick={handleStartCustomQuiz}
            disabled={selectedIds.size === 0}
            className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-body-bold text-sm flex items-center gap-2 shadow-lg transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>Launch Staged Quiz ({selectedIds.size})</span>
          </button>
        </div>
      </div>

      {/* Saved Sets Preset Bar */}
      {Object.keys(savedSets).length > 0 && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
            <span className="material-symbols-outlined text-[16px] text-primary">bookmark</span>
            <span>Saved Presets:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(savedSets).map(([setName, qIds]) => (
              <div
                key={setName}
                className="flex items-center gap-1.5 rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-1 font-mono-code text-xs text-on-surface"
              >
                <button
                  type="button"
                  onClick={() => handleLoadSet(setName)}
                  className="font-semibold hover:text-primary transition-colors cursor-pointer"
                >
                  {setName} ({qIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSet(setName)}
                  className="text-on-surface-variant hover:text-error transition-colors cursor-pointer ml-1"
                  title="Delete preset"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Current Selection Preset Tool */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low shadow-sm">
          <input
            type="text"
            placeholder="Save this selection as preset (e.g. Memory Circuits 2024)..."
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            className="flex-1 max-w-md rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-2 text-xs font-mono-code text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSaveSet}
            disabled={!newSetName.trim()}
            className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold transition-all cursor-pointer disabled:opacity-40"
          >
            Save Preset
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative sm:col-span-1">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[16px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search questions or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low pl-9 pr-3 py-2 text-xs font-mono-code text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs font-mono-code text-on-surface focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">Status: All Questions</option>
            <option value="unanswered">Status: Unanswered Only</option>
            <option value="answered">Status: Answered Previously</option>
          </select>
        </div>

        <div>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs font-mono-code text-on-surface focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">Year: All Years</option>
            {Array.from(new Set(allQuestions.map((q) => q.year)))
              .sort()
              .reverse()
              .map((y) => (
                <option key={y} value={y}>
                  Year {y}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <button
            type="button"
            onClick={selectAllFiltered}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-mono-code font-semibold text-on-surface transition-colors cursor-pointer"
          >
            Select First 100
          </button>
        </div>
      </div>

      {/* Questions Data Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-low shadow-md">
        <div className="max-h-[560px] overflow-y-auto">
          <table className="w-full text-left font-mono-code text-xs">
            <thead className="sticky top-0 bg-surface-container font-label-caps text-on-surface-variant uppercase border-b border-outline-variant/20 z-10">
              <tr>
                <th className="w-12 px-4 py-3 text-center">Pick</th>
                <th className="px-4 py-3">Item ID</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Topic</th>
                <th className="px-4 py-3">Question Stem</th>
                <th className="px-4 py-3 text-right">Attempt Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-on-surface">
              {filteredQuestions.slice(0, 100).map((q) => {
                const isSelected = selectedIds.has(q.id);
                const isAnswered = attemptedMap[q.id];

                return (
                  <tr
                    key={q.id}
                    onClick={() => toggleSelect(q.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-primary-container/20 text-on-surface font-semibold'
                        : 'hover:bg-surface-container/60'
                    }`}
                  >
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(q.id)}
                        className="h-4 w-4 rounded accent-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3 font-bold text-primary">{q.id}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{q.year}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-surface-container-high text-tertiary text-[10px] uppercase font-bold">
                        {q.topics?.[0] || 'software'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant max-w-md truncate">
                      {q.question ? q.question.replace(/<[^>]*>?/gm, '').slice(0, 80) : '(Schematic Diagram Question)'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isAnswered ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mastery-emerald/15 text-mastery-emerald text-[10px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-mastery-emerald" />
                          Attempted
                        </span>
                      ) : (
                        <span className="text-on-surface-variant/40 text-[10px]">Unattempted</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-outline-variant/20 bg-surface-container-lowest/80 px-4 py-2.5 flex items-center justify-between text-[11px] font-mono-code text-on-surface-variant">
          <span>Staged {selectedIds.size} of {filteredQuestions.length} matching items</span>
          <span>Showing up to 100 rows</span>
        </div>
      </div>
    </div>
  );
};

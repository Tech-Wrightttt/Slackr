import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckSquare,
  Search,
  Play,
  RotateCcw,
  Award,
  ArrowLeft,
  Trash2,
  Bookmark,
  Check,
  Filter,
} from 'lucide-react';
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

        // Load attempts from Dexie
        const attempts = await db.attempts.toArray();
        const aMap: Record<string, boolean> = {};
        for (const a of attempts) {
          aMap[a.questionId] = true;
        }
        setAttemptedMap(aMap);

        // Load saved quiz sets from localStorage
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

  // Filtered question list for builder table
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      // Select up to 100 from current filtered view
      filteredQuestions.slice(0, 100).forEach((q) => next.add(q.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleSaveSet = () => {
    if (!newSetName.trim() || selectedIds.size === 0) return;
    const updated = { ...savedSets, [newSetName.trim()]: Array.from(selectedIds) };
    setSavedSets(updated);
    localStorage.setItem('slackr_custom_quiz_sets', JSON.stringify(updated));
    setNewSetName('');
  };

  const handleLoadSet = (name: string) => {
    const ids = savedSets[name];
    if (ids) {
      setSelectedIds(new Set(ids));
    }
  };

  const handleDeleteSet = (name: string) => {
    const updated = { ...savedSets };
    delete updated[name];
    setSavedSets(updated);
    localStorage.setItem('slackr_custom_quiz_sets', JSON.stringify(updated));
  };

  const handleStartQuiz = async () => {
    if (selectedIds.size === 0) return;
    const qList = await QuestionsService.getCustomQuestions(Array.from(selectedIds));
    setQuizQuestions(qList);
    setIsQuizActive(true);
    setCurrentIndex(0);
    setSessionCompleted(false);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });
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

  if (!isQuizActive) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Tab 4
            </span>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Custom Quiz Builder</h1>
          </div>
          <p className="text-sm text-slate-400">
            Handpick questions across all 3,600+ vault notes, filter by status, and save reusable custom sets.
          </p>
        </div>

        {/* Top Control Bar / Selected Questions Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckSquare className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">
                {selectedIds.size} Questions Selected
              </span>
              <p className="text-xs text-slate-400">Ready to build personalized review session</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {selectedIds.size > 0 && (
              <button
                onClick={clearSelection}
                className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={handleStartQuiz}
              disabled={selectedIds.size === 0}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Play className="h-4 w-4" />
              <span>Start Custom Quiz</span>
            </button>
          </div>
        </div>

        {/* Saved Quiz Sets Section */}
        {Object.keys(savedSets).length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Bookmark className="h-3.5 w-3.5 text-emerald-400" />
              <span>Saved Problem Sets</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(savedSets).map(([setName, qIds]) => (
                <div
                  key={setName}
                  className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-200"
                >
                  <button
                    onClick={() => handleLoadSet(setName)}
                    className="font-medium hover:text-emerald-400 transition-colors"
                  >
                    {setName} ({qIds.length})
                  </button>
                  <button
                    onClick={() => handleDeleteSet(setName)}
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Current Selection Input */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Name this problem set (e.g. Tough Algorithms)..."
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              className="w-full sm:w-80 rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={handleSaveSet}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all"
            >
              Save Set
            </button>
          </div>
        )}

        {/* Filters Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search question text or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
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
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
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
              onClick={selectAllFiltered}
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Select First 100
            </button>
          </div>
        </div>

        {/* Question Selection Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm">
          <div className="max-h-[550px] overflow-y-auto">
            <table className="w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="sticky top-0 bg-slate-950 font-semibold text-slate-400">
                <tr>
                  <th className="w-12 px-4 py-3 text-center">Select</th>
                  <th className="px-4 py-3">Question ID</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Stem Preview</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredQuestions.slice(0, 100).map((q) => {
                  const isSelected = selectedIds.has(q.id);
                  const isAnswered = attemptedMap[q.id];
                  return (
                    <tr
                      key={q.id}
                      onClick={() => toggleSelect(q.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-500/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-sky-400">{q.id}</td>
                      <td className="px-4 py-3 text-slate-300">{q.year}</td>
                      <td className="px-4 py-3">
                        <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/20 uppercase">
                          {q.topics?.[0] || 'software'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-md truncate">
                        {q.question || '(Image-based question stem)'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isAnswered ? (
                          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                            Attempted
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-600">Unattempted</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-800 bg-slate-950/60 px-4 py-2 text-right text-[11px] text-slate-500">
            Showing up to 100 of {filteredQuestions.length} matching questions
          </div>
        </div>
      </div>
    );
  }

  // Quiz Session Ended
  if (sessionCompleted) {
    const totalAnswered = sessionStats.correct + sessionStats.incorrect;
    const accuracy = totalAnswered > 0 ? Math.round((sessionStats.correct / totalAnswered) * 100) : 0;

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Award className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Custom Quiz Finished!</h2>
          <p className="mt-2 text-sm text-slate-400">Here is your customized session summary:</p>

          <div className="my-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <span className="text-xs text-slate-400">Accuracy</span>
              <p className="mt-1 text-2xl font-bold text-emerald-400">{accuracy}%</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <span className="text-xs text-slate-400">Score</span>
              <p className="mt-1 text-2xl font-bold text-white">
                {sessionStats.correct} / {totalAnswered}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <span className="text-xs text-slate-400">Total Time</span>
              <p className="mt-1 text-2xl font-bold text-sky-400 font-mono">
                {Math.round(sessionStats.totalTime)}s
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={handleRestartQuiz}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400 active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Custom Set</span>
            </button>
            <button
              onClick={() => setIsQuizActive(false)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Return to Builder</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = quizQuestions[currentIndex];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsQuizActive(false)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Exit to Builder</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-xs text-slate-400">
            {currentIndex + 1} of {quizQuestions.length} questions
          </div>
          <div className="h-2 w-32 sm:w-48 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / quizQuestions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {currentQ ? (
        <QuestionCard
          question={currentQ}
          questionNumber={currentIndex + 1}
          totalQuestions={quizQuestions.length}
          onAnswerSubmitted={handleAnswerSubmitted}
          onNextQuestion={handleNextQuestion}
          hasNext={currentIndex + 1 < quizQuestions.length}
        />
      ) : (
        <div className="py-20 text-center text-slate-400">Loading custom questions...</div>
      )}
    </div>
  );
};

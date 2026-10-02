import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Play,
  RotateCcw,
  Award,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Hash,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronLeft,
} from 'lucide-react';
import { QuestionsService, type ExamSession } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { db } from '../db';
import { QuestionCard } from '../components/QuestionCard';
import type { QuestionData, SRScheduleRecord } from '../db/schema';

export const QuizByYear: React.FC = () => {
  const [years, setYears] = useState<string[]>([]);
  const [yearCounts, setYearCounts] = useState<Record<string, number>>({});
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // Available sessions for the selected year
  const [yearSessions, setYearSessions] = useState<ExamSession[]>([]);
  const [allYearQuestions, setAllYearQuestions] = useState<QuestionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');

  // Track which session cards have "See all numbers" expanded
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(new Set());

  // Attempt history status map: questionId -> { isCorrect: boolean }
  const [attemptStatusMap, setAttemptStatusMap] = useState<Record<string, { isCorrect: boolean }>>({});

  // Active quiz view state
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [sessionCompleted, setSessionCompleted] = useState<boolean>(false);
  const [showNumbersDrawerInQuiz, setShowNumbersDrawerInQuiz] = useState<boolean>(false);

  const [sessionStats, setSessionStats] = useState<{
    correct: number;
    incorrect: number;
    totalTime: number;
  }>({ correct: 0, incorrect: 0, totalTime: 0 });
  const [loading, setLoading] = useState<boolean>(true);

  // Load years on mount
  useEffect(() => {
    const loadYears = async () => {
      try {
        const meta = await QuestionsService.loadMetadataSummary();
        setYears(meta.years || []);
        setYearCounts(meta.year_counts || {});
      } catch (err) {
        console.error('Failed to load years:', err);
      } finally {
        setLoading(false);
      }
    };
    loadYears();
  }, []);

  // When a year is selected, load its sessions, all questions, and attempt history
  const handleSelectYear = async (year: string) => {
    setSelectedYear(year);
    setSelectedSessionId('all');
    setIsQuizActive(false);
    setExpandedSessionIds(new Set());
    setLoading(true);

    try {
      const [sessions, qList, attempts] = await Promise.all([
        QuestionsService.getSessionsForYear(year),
        QuestionsService.getQuestionsByYear(year, 'all'),
        db.attempts.toArray(),
      ]);

      setYearSessions(sessions);
      setAllYearQuestions(qList);

      // Build status map (latest attempt per question)
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

  /**
   * Starts a session strictly preserving the original chronological sequence.
   * If initialIndex > 0, jumps directly to that question number while keeping
   * the full paper in sequential order!
   */
  const handleStartSession = async (sessionId: string = 'all', initialIndex: number = 0) => {
    if (!selectedYear) return;
    setSelectedSessionId(sessionId);
    setLoading(true);
    setSessionCompleted(false);
    setShowNumbersDrawerInQuiz(false);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });

    try {
      // Questions returned here are strictly sorted by: Year -> Season -> Paper -> Q# (1-80)
      const qList = await QuestionsService.getQuestionsByYear(selectedYear, sessionId);
      setQuestions(qList);
      // Ensure initialIndex is within range
      const safeIndex = Math.max(0, Math.min(initialIndex, qList.length - 1));
      setCurrentIndex(safeIndex);
      setIsQuizActive(true);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
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

    // Update status map so number pills reflect immediate correctness
    setAttemptStatusMap((prev) => ({
      ...prev,
      [questionId]: { isCorrect },
    }));

    setSessionStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      incorrect: prev.incorrect + (isCorrect ? 0 : 1),
      totalTime: prev.totalTime + timeSeconds,
    }));

    return { schedule: res.schedule };
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setSessionCompleted(true);
    }
  };

  const handlePrevQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleRestartQuiz = () => {
    setCurrentIndex(0);
    setSessionCompleted(false);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });
  };

  // Helper to render question number buttons for any list of questions
  const renderNumberGrid = (qList: QuestionData[], targetSessionId: string) => {
    return (
      <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1.5 p-3 rounded-2xl border border-slate-800/80 bg-slate-950/80 animate-in fade-in duration-150">
        {qList.map((q, qIdx) => {
          const status = attemptStatusMap[q.id];
          const isCurr = isQuizActive && currentIndex === qIdx;
          const label = q.sub_number ? `${q.number}.${q.sub_number}` : `${q.number}`;

          let colorClasses = 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-600 hover:bg-slate-800';
          if (isCurr) {
            colorClasses = 'border-sky-400 bg-sky-500 text-white font-bold ring-2 ring-sky-400/40';
          } else if (status) {
            if (status.isCorrect) {
              colorClasses = 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25';
            } else {
              colorClasses = 'border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25';
            }
          }

          return (
            <button
              key={q.id}
              onClick={(e) => {
                e.stopPropagation();
                if (isQuizActive) {
                  setCurrentIndex(qIdx);
                  setShowNumbersDrawerInQuiz(false);
                } else {
                  handleStartSession(targetSessionId, qIdx);
                }
              }}
              className={`flex h-9 items-center justify-center rounded-xl border text-xs font-semibold transition-all active:scale-95 ${colorClasses}`}
              title={`Question ${label} (${q.id})${status ? (status.isCorrect ? ' • Correct' : ' • Incorrect') : ' • Unattempted'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  };

  // View 1: Year Grid Selection (2026 down to 2007)
  if (!selectedYear) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/20">
              Tab 1
            </span>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Browse by Exam Year</h1>
          </div>
          <p className="text-sm text-slate-400">
            Chronological archive sorted from 2026 down to 2007. Choose a year to access its official Spring & Autumn papers.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">Loading exam archives...</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-5">
            {years.map((year) => {
              const count = yearCounts[year] || 0;
              const isNewFormat = parseInt(year, 10) >= 2023;
              return (
                <button
                  key={year}
                  onClick={() => handleSelectYear(year)}
                  className="group flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center backdrop-blur-sm hover:border-sky-500/50 hover:bg-slate-900 transition-all active:scale-95"
                >
                  <div className="mb-2 flex items-center justify-center rounded-xl bg-sky-500/10 p-3 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition-transform">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <span className="text-xl font-bold text-white group-hover:text-sky-400 transition-colors">
                    {year}
                  </span>
                  <span className="mt-1 text-xs text-slate-400">{count} questions</span>
                  <span className="mt-2 rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-400">
                    {isNewFormat ? 'FE-A & FE-B' : 'AM & PM'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View 2: Exam Session Selection for Selected Year (Spring vs Autumn, Paper A vs Paper B)
  if (!isQuizActive) {
    const totalYearQuestions = yearCounts[selectedYear] || 0;
    const isMockExpanded = expandedSessionIds.has('all');

    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6 animate-in fade-in duration-200">
        <button
          onClick={() => setSelectedYear(null)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to All Years (2026–2007)</span>
        </button>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white">Year {selectedYear} Examination Papers</h1>
            <span className="rounded-full bg-sky-500/10 border border-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-400">
              {totalYearQuestions} Total Questions
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Practice the full year as a comprehensive mock exam, or target specific individual papers in exact sequential order (Q1–Q80).
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2">
          {/* Option: Full Year Mock Exam */}
          <div className="rounded-3xl border border-sky-500/40 bg-gradient-to-br from-sky-500/10 via-slate-900 to-slate-900 p-6 backdrop-blur-sm sm:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-sky-500/20 p-3 text-sky-400 border border-sky-500/30">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Full {selectedYear} Mock Exam (All Papers)
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Covers Spring and Autumn papers in strict sequential order ({totalYearQuestions} questions).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleStartSession('all', 0)}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-sky-500/20 hover:bg-sky-400 active:scale-95 transition-all"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>Practice Full Year</span>
                </button>
              </div>
            </div>

            {/* "See all numbers" toggle for Mock Exam */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                onClick={() => toggleExpandedSession('all')}
                className="flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors"
              >
                <Hash className="h-3.5 w-3.5" />
                <span>{isMockExpanded ? 'Hide all numbers' : `See all numbers (1–${allYearQuestions.length})`}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isMockExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isMockExpanded && (
                <div className="mt-3">
                  <p className="text-[11px] text-slate-400 mb-2">
                    Click any question number below to immediately view and practice that question:
                  </p>
                  {renderNumberGrid(allYearQuestions, 'all')}
                </div>
              )}
            </div>
          </div>

          {/* Individual Exam Sessions */}
          {yearSessions.map((sess) => {
            const isSpring = sess.season === 'S';
            const isExpanded = expandedSessionIds.has(sess.session_id);
            // Filter questions strictly belonging to this session
            const sessionQuestions = allYearQuestions.filter((q) => q.session_id === sess.session_id);

            return (
              <div
                key={sess.session_id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                        isSpring
                          ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                      }`}
                    >
                      {isSpring ? '🌸 Spring / April' : '🍂 Autumn / October'}
                    </span>
                    <span className="font-mono text-xs text-slate-400 font-semibold">
                      {sess.question_count} Questions
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white">
                    {sess.session_title}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Questions {sess.first_q} through {sess.last_q} in official sequence.
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] text-slate-500">{sess.session_id}</span>
                    <button
                      onClick={() => handleStartSession(sess.session_id, 0)}
                      className="font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 text-xs transition-colors"
                    >
                      <span>Practice Paper</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* "See all numbers" below Practice Paper */}
                  <div className="pt-2 border-t border-slate-800/50">
                    <button
                      onClick={() => toggleExpandedSession(sess.session_id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
                    >
                      <Hash className="h-3 w-3 text-sky-400" />
                      <span>{isExpanded ? 'Hide all numbers' : `See all numbers (Q${sess.first_q}–Q${sess.last_q})`}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {isExpanded && (
                      <div className="mt-2">
                        <p className="text-[10px] text-slate-500 mb-2">
                          Click any number to practice that question directly in sequence:
                        </p>
                        {renderNumberGrid(sessionQuestions, sess.session_id)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // View 3: Session Completed Summary
  if (sessionCompleted) {
    const totalAnswered = sessionStats.correct + sessionStats.incorrect;
    const accuracy = totalAnswered > 0 ? Math.round((sessionStats.correct / totalAnswered) * 100) : 0;

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Award className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Exam Session Complete!</h2>
          <p className="mt-2 text-sm text-slate-400">
            Year {selectedYear} •{' '}
            {selectedSessionId === 'all'
              ? 'Full Year Mock Exam'
              : yearSessions.find((s) => s.session_id === selectedSessionId)?.session_title || selectedSessionId}
          </p>

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
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 hover:bg-sky-400 active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Session</span>
            </button>
            <button
              onClick={() => setIsQuizActive(false)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Choose Another Paper</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // View 4: Active Quiz Interface
  const currentQ = questions[currentIndex];
  const activeSessionTitle =
    selectedSessionId === 'all'
      ? `Full ${selectedYear} Mock Exam`
      : yearSessions.find((s) => s.session_id === selectedSessionId)?.session_title || selectedYear;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-4">
      {/* Quiz Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => setIsQuizActive(false)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Exit to Papers ({activeSessionTitle})</span>
        </button>

        {/* Question Counter + "See all numbers" Drawer Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNumbersDrawerInQuiz(!showNumbersDrawerInQuiz)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-slate-700 transition-all"
            title="Open question grid"
          >
            <Hash className="h-3.5 w-3.5" />
            <span>
              Question {currentIndex + 1} of {questions.length}
            </span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showNumbersDrawerInQuiz ? 'rotate-180' : ''}`} />
          </button>

          {/* Previous / Next shortcuts */}
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevQuestion}
              disabled={currentIndex === 0}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous question"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextQuestion}
              disabled={currentIndex === questions.length - 1}
              className="rounded-lg border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next question"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="h-2 w-24 sm:w-36 overflow-hidden rounded-full bg-slate-800 hidden sm:block">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Floating / Popover Numbers Grid inside Active Quiz */}
      {showNumbersDrawerInQuiz && (
        <div className="rounded-3xl border border-sky-500/30 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md animate-in fade-in duration-200">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-400">
            <span className="font-semibold text-white">
              Jump to Question Number (Chronological 1–{questions.length}):
            </span>
            <span className="text-[11px] text-slate-500">
              Green = Correct • Red = Incorrect • Blue = Current
            </span>
          </div>
          {renderNumberGrid(questions, selectedSessionId)}
        </div>
      )}

      {currentQ ? (
        <QuestionCard
          question={currentQ}
          questionNumber={currentIndex + 1}
          totalQuestions={questions.length}
          onAnswerSubmitted={handleAnswerSubmitted}
          onNextQuestion={handleNextQuestion}
          hasNext={currentIndex + 1 < questions.length}
        />
      ) : (
        <div className="py-20 text-center text-slate-400">No questions found for this selection.</div>
      )}
    </div>
  );
};

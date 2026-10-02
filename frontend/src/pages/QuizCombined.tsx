import React, { useState, useEffect } from 'react';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { QuestionCard } from '../components/QuestionCard';
import type { QuestionData, SRScheduleRecord } from '../db/schema';

export const QuizCombined: React.FC = () => {
  const [years, setYears] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('2024');
  const [selectedTopic, setSelectedTopic] = useState<string>('networking');

  const [matchingQuestions, setMatchingQuestions] = useState<QuestionData[]>([]);
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [sessionCompleted, setSessionCompleted] = useState<boolean>(false);
  const [sessionStats, setSessionStats] = useState<{
    correct: number;
    incorrect: number;
    totalTime: number;
  }>({ correct: 0, incorrect: 0, totalTime: 0 });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const meta = await QuestionsService.loadMetadataSummary();
        const yList = meta.years || [];
        const tList = meta.topics || [];
        setYears(yList);
        setTopics(tList);
        if (yList.length > 0 && !selectedYear) setSelectedYear(yList[0]);
        if (tList.length > 0 && !selectedTopic) setSelectedTopic(tList[0]);
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      } finally {
        setLoading(false);
      }
    };
    loadFilters();
  }, []);

  // Update matching questions whenever year or topic changes
  useEffect(() => {
    const updateMatches = async () => {
      if (selectedYear && selectedTopic) {
        const matches = await QuestionsService.getQuestionsCombined(selectedYear, selectedTopic);
        setMatchingQuestions(matches);
      }
    };
    updateMatches();
  }, [selectedYear, selectedTopic]);

  const handleStartQuiz = () => {
    if (matchingQuestions.length === 0) return;
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
    if (currentIndex + 1 < matchingQuestions.length) {
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

  // View 1: Setup Matrix Filters
  if (!isQuizActive) {
    return (
      <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 animate-in fade-in duration-300">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-mono-timer text-xs text-confidence-amber">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-confidence-amber animate-ping" />
            <span>DUAL-AXIS CROSS-RELATIONAL QUERY ENGINE</span>
          </div>
          <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
            Combined Matrix Filters
          </h1>
          <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
            Intersect specific examination years with target knowledge domains. Run calibrated sprint drills on
            hyper-specific syllabus intersections.
          </p>
        </div>

        {/* Matrix Selection Card */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Axis 1: Year Selector */}
            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                Axis 1: Target Exam Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm text-on-surface font-mono-code focus:border-primary focus:outline-none cursor-pointer"
              >
                {years.map((y) => (
                  <option key={y} value={y} className="bg-surface-container-lowest text-on-surface">
                    Year {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Axis 2: Topic Selector */}
            <div className="flex flex-col gap-2">
              <label className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
                Axis 2: Curriculum Domain
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm text-on-surface font-mono-code focus:border-primary focus:outline-none uppercase cursor-pointer"
              >
                {topics.map((t) => (
                  <option key={t} value={t} className="bg-surface-container-lowest text-on-surface uppercase">
                    #{t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Staging Summary & Launch Action */}
          <div className="pt-4 border-t border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-confidence-amber">
                <span className="material-symbols-outlined text-[22px]">filter_alt</span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono-code text-xs text-on-surface-variant">Staged Subset:</span>
                <span className="font-mono-code text-sm font-bold text-on-surface">
                  {matchingQuestions.length} Questions matching Year {selectedYear} + #{selectedTopic}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartQuiz}
              disabled={matchingQuestions.length === 0}
              className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-body-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">play_arrow</span>
              <span>Launch Matrix Session ({matchingQuestions.length})</span>
            </button>
          </div>
        </div>

        {/* Live Staged Questions Preview */}
        {matchingQuestions.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              Staged Questions in Set
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {matchingQuestions.map((q, idx) => (
                <div
                  key={q.id}
                  className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/20 flex items-start gap-2.5 shadow-sm"
                >
                  <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-surface-container-high text-primary font-bold">
                    Q{q.number || idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono-code text-xs text-on-surface truncate">
                      {q.question.replace(/<[^>]*>?/gm, '').slice(0, 75)}...
                    </p>
                    <span className="font-mono-code text-[11px] text-on-surface-variant">
                      {q.session_title || q.season || 'Annual'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // View 2: Active Session Interface
  const currentQ = matchingQuestions[currentIndex];

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
              Matrix Session Complete
            </span>
            <h2 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface mt-1">
              Year {selectedYear} • #{selectedTopic}
            </h2>
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
              <span>Retry Staged Matrix</span>
            </button>
            <button
              onClick={() => setIsQuizActive(false)}
              className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-6 py-3 text-sm font-body-bold text-on-surface hover:bg-surface-container-high transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              <span>Reconfigure Filters</span>
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
          <span>Exit Matrix (Year {selectedYear} • #{selectedTopic})</span>
        </button>
        <span className="font-mono-code text-xs text-on-surface-variant">
          Question {currentIndex + 1} of {matchingQuestions.length}
        </span>
      </div>

      {currentQ ? (
        <QuestionCard
          question={currentQ}
          questionNumber={currentIndex + 1}
          totalQuestions={matchingQuestions.length}
          onAnswerSubmitted={handleAnswerSubmitted}
          onNextQuestion={handleNextQuestion}
          onPreviousQuestion={() => currentIndex > 0 && setCurrentIndex((p) => p - 1)}
          onSkipQuestion={handleNextQuestion}
          hasNext={currentIndex + 1 < matchingQuestions.length}
          hasPrevious={currentIndex > 0}
          questions={matchingQuestions}
          currentIndex={currentIndex}
          onSelectIndex={(idx) => setCurrentIndex(idx)}
        />
      ) : (
        <div className="py-20 text-center text-on-surface-variant font-mono-code text-sm">
          No questions found for this intersection.
        </div>
      )}
    </div>
  );
};

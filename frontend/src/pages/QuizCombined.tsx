import React, { useState, useEffect } from 'react';
import { Filter, Play, RotateCcw, Award, ArrowLeft } from 'lucide-react';
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
        setYears(meta.years || []);
        setTopics(meta.topics || []);
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

  if (!isQuizActive) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-400 border border-purple-500/20">
              Tab 3
            </span>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Combined Filters Quiz</h1>
          </div>
          <p className="text-sm text-slate-400">
            Target exam questions by simultaneously filtering both Year AND Topic.
          </p>
        </div>

        {/* Dual Selection Card */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Year Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                1. Select Exam Year
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white focus:border-purple-500 focus:outline-none"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Topic Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                2. Select Topic Category
              </label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white focus:border-purple-500 focus:outline-none uppercase"
              >
                {topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter Match Summary */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
            <div>
              <h3 className="font-bold text-white text-base">
                Found {matchingQuestions.length} Questions
              </h3>
              <p className="text-xs text-slate-400">
                Matching: Year <span className="font-semibold text-purple-300">{selectedYear}</span> • Category{' '}
                <span className="font-semibold text-purple-300 uppercase">{selectedTopic}</span>
              </p>
            </div>

            <button
              onClick={handleStartQuiz}
              disabled={matchingQuestions.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:from-purple-400 hover:to-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <Play className="h-4 w-4" />
              <span>Start Combined Quiz</span>
            </button>
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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Award className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Combined Quiz Complete!</h2>
          <p className="mt-2 text-sm text-slate-400">
            Year {selectedYear} • {selectedTopic.toUpperCase()}
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
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/25 hover:bg-purple-500 active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Set</span>
            </button>
            <button
              onClick={() => setIsQuizActive(false)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Change Filters</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = matchingQuestions[currentIndex];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-4">
      {/* Quiz Top Control Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsQuizActive(false)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Exit to Filter Selection</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-xs text-slate-400">
            {currentIndex + 1} of {matchingQuestions.length} questions
          </div>
          <div className="h-2 w-32 sm:w-48 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / matchingQuestions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {currentQ ? (
        <QuestionCard
          question={currentQ}
          questionNumber={currentIndex + 1}
          totalQuestions={matchingQuestions.length}
          onAnswerSubmitted={handleAnswerSubmitted}
          onNextQuestion={handleNextQuestion}
          hasNext={currentIndex + 1 < matchingQuestions.length}
        />
      ) : (
        <div className="py-20 text-center text-slate-400">No questions found matching both filters.</div>
      )}
    </div>
  );
};

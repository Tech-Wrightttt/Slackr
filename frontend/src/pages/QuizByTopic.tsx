import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Layers,
  Play,
  RotateCcw,
  Award,
  ArrowLeft,
  Search,
  Sparkles,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { QuestionCard } from '../components/QuestionCard';
import type { QuestionData, SRScheduleRecord } from '../db/schema';

export const QuizByTopic: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialTopic = searchParams.get('topic');

  const [topics, setTopics] = useState<string[]>([]);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [topicSubdecks, setTopicSubdecks] = useState<Record<string, Array<{ year: string; subdeck: string; count: number }>>>({});
  const [topicErrorRates, setTopicErrorRates] = useState<Record<string, number>>({});
  const [selectedTopic, setSelectedTopic] = useState<string | null>(initialTopic);
  const [selectedSubdeckYear, setSelectedSubdeckYear] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quiz active state
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [sessionCompleted, setSessionCompleted] = useState<boolean>(false);
  const [sessionStats, setSessionStats] = useState<{
    correct: number;
    incorrect: number;
    totalTime: number;
  }>({ correct: 0, incorrect: 0, totalTime: 0 });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadTopicsData = async () => {
      try {
        const meta = await QuestionsService.loadMetadataSummary();
        setTopics(meta.topics || []);
        setTopicCounts(meta.topic_counts || {});
        setTopicSubdecks(meta.topic_subdecks || {});

        const rates = await AnalyticsEngine.getErrorRates();
        const errMap: Record<string, number> = {};
        for (const r of rates) {
          errMap[r.topic] = r.errorRate;
        }
        setTopicErrorRates(errMap);

        if (initialTopic) {
          setSelectedTopic(initialTopic);
        }
      } catch (err) {
        console.error('Failed to load topics:', err);
      } finally {
        setLoading(false);
      }
    };
    loadTopicsData();
  }, [initialTopic]);

  const handleSelectTopic = (topic: string) => {
    setSelectedTopic(topic);
    setSelectedSubdeckYear('all');
    setIsQuizActive(false);
  };

  const handleStartTopicQuiz = async (yearFilter: string = 'all') => {
    if (!selectedTopic) return;
    setSelectedSubdeckYear(yearFilter);
    setLoading(true);
    setSessionCompleted(false);
    setCurrentIndex(0);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });

    try {
      // Questions returned here are strictly sorted: Year (desc) -> Season -> Paper -> Q#
      const qList = await QuestionsService.getQuestionsByTopic(selectedTopic, yearFilter);
      setQuestions(qList);
      setIsQuizActive(true);
    } catch (err) {
      console.error('Failed to load questions for topic:', err);
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

  const handleRestartQuiz = () => {
    setCurrentIndex(0);
    setSessionCompleted(false);
    setSessionStats({ correct: 0, incorrect: 0, totalTime: 0 });
  };

  const filteredTopics = topics.filter((t) =>
    t.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // View 1: Topics Directory Hub
  if (!selectedTopic) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
                Tab 2
              </span>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Browse by Topic Category</h1>
            </div>
            <p className="text-sm text-slate-400">
              PelNETS standardized categories with parent decks (#category) and yearly subdecks (#category/YYYY).
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search 29 categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-900/80 pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">Loading topic decks...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTopics.map((topic) => {
              const count = topicCounts[topic] || 0;
              const errorRate = topicErrorRates[topic];
              return (
                <button
                  key={topic}
                  onClick={() => handleSelectTopic(topic)}
                  className="group flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left backdrop-blur-sm hover:border-indigo-500/50 hover:bg-slate-900 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-400 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors uppercase text-sm">
                        #{topic}
                      </h3>
                      <p className="text-xs text-slate-400">{count} questions across all years</p>
                    </div>
                  </div>

                  <div className="text-right">
                    {errorRate !== undefined ? (
                      <span
                        className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                          errorRate >= 50
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : errorRate >= 25
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {errorRate}% err
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Unattempted</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View 2: Topic Hub with 3-Way Subdeck Hierarchy (#topic vs #topic/YYYY)
  if (!isQuizActive) {
    const totalTopicQuestions = topicCounts[selectedTopic] || 0;
    const subdecks = topicSubdecks[selectedTopic] || [];

    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-6 animate-in fade-in duration-200">
        <button
          onClick={() => setSelectedTopic(null)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to All Categories</span>
        </button>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold uppercase text-white">#{selectedTopic}</h1>
            <span className="rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-400">
              {totalTopicQuestions} Questions Total
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Practice the full topic deck across all 20 exam years, or select an individual yearly subdeck (e.g. #{selectedTopic}/YYYY).
          </p>
        </div>

        {/* Master Deck Card */}
        <div
          onClick={() => handleStartTopicQuiz('all')}
          className="group cursor-pointer rounded-3xl border border-indigo-500/40 bg-gradient-to-br from-indigo-500/15 via-slate-900 to-slate-900 p-6 backdrop-blur-sm hover:border-indigo-400 transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-indigo-500/20 p-3 text-indigo-400 border border-indigo-500/30 group-hover:scale-105 transition-transform">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors uppercase">
                  Full #{selectedTopic} Master Deck
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Chronological progression across all exam years (2026 down to 2007) • {totalTopicQuestions} questions.
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 group-hover:bg-indigo-500 transition-colors">
              <Play className="h-3.5 w-3.5" />
              <span>Practice All</span>
            </span>
          </div>
        </div>

        {/* Subdecks Header */}
        <div className="pt-2">
          <h2 className="text-base font-bold text-white mb-1">Yearly Subdecks (#{selectedTopic}/YYYY)</h2>
          <p className="text-xs text-slate-400 mb-4">
            Isolate how this category appeared in a specific examination year.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {subdecks.map((sub) => (
              <div
                key={sub.year}
                onClick={() => handleStartTopicQuiz(sub.year)}
                className="group cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center backdrop-blur-sm hover:border-indigo-500/50 hover:bg-slate-900 transition-all"
              >
                <span className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
                  {sub.year}
                </span>
                <p className="text-xs text-slate-400 mt-0.5">{sub.count} questions</p>
                <span className="mt-2 inline-block font-mono text-[10px] text-indigo-400/80 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                  #{sub.subdeck}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // View 3: Session Completed
  if (sessionCompleted) {
    const totalAnswered = sessionStats.correct + sessionStats.incorrect;
    const accuracy = totalAnswered > 0 ? Math.round((sessionStats.correct / totalAnswered) * 100) : 0;
    const subdeckLabel =
      selectedSubdeckYear === 'all'
        ? `#${selectedTopic} (All Years)`
        : `#${selectedTopic}/${selectedSubdeckYear}`;

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Award className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl uppercase">{subdeckLabel} Complete!</h2>
          <p className="mt-2 text-sm text-slate-400">Here is your performance breakdown for this topic session:</p>

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
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Session</span>
            </button>
            <button
              onClick={() => setIsQuizActive(false)}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Choose Another Subdeck</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // View 4: Active Topic Quiz Interface
  const currentQ = questions[currentIndex];
  const activeLabel =
    selectedSubdeckYear === 'all'
      ? `#${selectedTopic} (All Years)`
      : `#${selectedTopic}/${selectedSubdeckYear}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsQuizActive(false)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Exit Deck ({activeLabel})</span>
        </button>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-xs text-slate-400">
            Question {currentIndex + 1} of {questions.length}
          </div>
          <div className="h-2 w-32 sm:w-48 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

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
        <div className="py-20 text-center text-slate-400">No questions found in this subdeck.</div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Repeat, CheckCircle, Clock, Calendar, ArrowRight, Award, RotateCcw, AlertCircle } from 'lucide-react';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { QuestionCard } from '../components/QuestionCard';
import type { QuestionData, SRScheduleRecord } from '../db/schema';
import { useStore } from '../store/useStore';

export const QuizSpacedRepetition: React.FC = () => {
  const { currentAlgo } = useStore();
  const [dueSchedules, setDueSchedules] = useState<SRScheduleRecord[]>([]);
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
    const loadDue = async () => {
      try {
        const dueList = await StatsDbService.getDueReviews();
        // Sort by earliest nextReviewDate
        dueList.sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
        setDueSchedules(dueList);

        if (dueList.length > 0) {
          const ids = dueList.map((d) => d.questionId);
          const qList = await QuestionsService.getCustomQuestions(ids);
          setQuestions(qList);
        }
      } catch (err) {
        console.error('Failed to load due reviews:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDue();
  }, []);

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

  if (loading) {
    return <div className="flex justify-center py-20 text-slate-400">Checking scheduled reviews...</div>;
  }

  // No reviews due
  if (questions.length === 0 && !sessionCompleted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">All Caught Up!</h2>
          <p className="mt-2 text-sm text-slate-400">
            There are no spaced repetition reviews currently due. The {currentAlgo} scheduler has queued all
            your flashcards for future dates.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/quiz/year"
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 active:scale-95 transition-all"
            >
              <span>Practice New Questions</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <span>View Weak Spots</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Completed session
  if (sessionCompleted) {
    const totalAnswered = sessionStats.correct + sessionStats.incorrect;
    const accuracy = totalAnswered > 0 ? Math.round((sessionStats.correct / totalAnswered) * 100) : 0;

    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-8 shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Award className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">SRS Review Complete!</h2>
          <p className="mt-2 text-sm text-slate-400">
            Great work! All due reviews have been answered and rescheduled using the {currentAlgo} algorithm.
          </p>

          <div className="my-8 grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <span className="text-xs text-slate-400">Retention</span>
              <p className="mt-1 text-2xl font-bold text-purple-400">{accuracy}%</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <span className="text-xs text-slate-400">Reviewed</span>
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
            <Link
              to="/analytics"
              className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-600/25 hover:bg-purple-500 active:scale-95 transition-all"
            >
              <span>View Updated Analytics</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={handleRestartQuiz}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Review Again</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = questions[currentIndex];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-4">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-purple-500/10 px-2.5 py-1 text-xs font-semibold text-purple-400 border border-purple-500/20">
            SRS Mode: {currentAlgo}
          </span>
          <span className="text-xs text-slate-400">
            Card {currentIndex + 1} of {questions.length} due
          </span>
        </div>

        <div className="h-2 w-32 sm:w-48 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {currentQ && (
        <QuestionCard
          question={currentQ}
          questionNumber={currentIndex + 1}
          totalQuestions={questions.length}
          onAnswerSubmitted={handleAnswerSubmitted}
          onNextQuestion={handleNextQuestion}
          hasNext={currentIndex + 1 < questions.length}
        />
      )}
    </div>
  );
};

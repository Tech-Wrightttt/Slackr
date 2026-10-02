import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { QuestionCard } from '../components/QuestionCard';
import type { QuestionData, SRScheduleRecord } from '../db/schema';
import { useStore } from '../store/useStore';

export const QuizSpacedRepetition: React.FC = () => {
  const { currentAlgo, theme } = useStore();
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
    return (
      <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant">
        Synchronizing SRS Leitner telemetry...
      </div>
    );
  }

  // View 1: Zero reviews due / All caught up
  if (questions.length === 0 && !sessionCompleted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-8 shadow-2xl flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center p-2 border border-outline-variant/30 shadow-inner">
            <img
              src={theme === 'dark' ? '/koala-mascot.png' : '/koala-mascot-light.png'}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/slackr-logo.svg';
              }}
              alt="Slackr Koala Resting"
              className="w-full h-full object-contain"
            />
          </div>

          <div>
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-mastery-emerald inline-block" />
              <span className="font-label-caps text-xs text-primary uppercase font-bold tracking-widest">
                Deck Fully Synchronized
              </span>
            </div>
            <h2 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
              All Caught Up!
            </h2>
            <p className="mt-2 text-sm font-body-base text-on-surface-variant leading-relaxed max-w-md">
              There are no spaced repetition reviews currently due. The {currentAlgo} scheduler has calculated that
              all practiced cards remain within safe retention thresholds.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link
              to="/quiz/year"
              className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-fixed-dim px-6 py-3 text-sm font-body-bold text-on-primary shadow-lg transition-all active:scale-95"
            >
              <span>Practice New Exam Questions</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
            <Link
              to="/analytics"
              className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-6 py-3 text-sm font-body-bold text-on-surface hover:bg-surface-container-high transition-all active:scale-95"
            >
              <span>Inspect Weak Spots</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // View 2: Session Completed
  if (sessionCompleted) {
    const totalAnswered = sessionStats.correct + sessionStats.incorrect;
    const accuracy = totalAnswered > 0 ? Math.round((sessionStats.correct / totalAnswered) * 100) : 0;

    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center animate-in fade-in duration-300">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-8 shadow-2xl flex flex-col gap-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-mastery-emerald/15 text-mastery-emerald border border-mastery-emerald/30">
            <span className="material-symbols-outlined text-4xl">verified</span>
          </div>

          <div>
            <span className="font-label-caps text-xs text-primary uppercase tracking-widest font-bold">
              Cognitive Retention Cycle Complete
            </span>
            <h2 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface mt-1">
              SRS Due Deck Cleared
            </h2>
            <p className="mt-1 text-sm font-mono-code text-on-surface-variant">
              {questions.length} Items Reviewed via {currentAlgo} Algorithm
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
              <span>Re-run Review Set</span>
            </button>
            <Link
              to="/"
              className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-6 py-3 text-sm font-body-bold text-on-surface hover:bg-surface-container-high transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">dashboard</span>
              <span>Return to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // View 3: Active SRS Review Interface
  const currentQ = questions[currentIndex];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Exit SRS Queue ({currentAlgo})</span>
        </Link>
        <span className="font-mono-code text-xs text-on-surface-variant">
          SRS Card {currentIndex + 1} of {questions.length}
        </span>
      </div>

      {currentQ ? (
        <QuestionCard
          question={currentQ}
          questionNumber={currentIndex + 1}
          totalQuestions={questions.length}
          onAnswerSubmitted={handleAnswerSubmitted}
          onNextQuestion={handleNextQuestion}
          onPreviousQuestion={() => currentIndex > 0 && setCurrentIndex((p) => p - 1)}
          onSkipQuestion={handleNextQuestion}
          hasNext={currentIndex + 1 < questions.length}
          hasPrevious={currentIndex > 0}
          questions={questions}
          currentIndex={currentIndex}
          onSelectIndex={(idx) => setCurrentIndex(idx)}
        />
      ) : (
        <div className="py-20 text-center text-on-surface-variant font-mono-code text-sm">
          No questions ready for review.
        </div>
      )}
    </div>
  );
};

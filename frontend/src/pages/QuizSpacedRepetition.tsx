import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { QuizSession } from '../components/QuizSession';
import type { QuestionData, SRScheduleRecord } from '../db/schema';
import { useStore } from '../store/useStore';
import { BrandLogo } from '../components/BrandLogo';

export const QuizSpacedRepetition: React.FC = () => {
  const { currentAlgo, theme } = useStore();
  const [dueSchedules, setDueSchedules] = useState<SRScheduleRecord[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

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

  if (loading) {
    return (
      <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant">
        Synchronizing SRS Leitner telemetry...
      </div>
    );
  }

  // View 1: Zero reviews due / All caught up
  if (questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in fade-in duration-300">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-8 shadow-2xl flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center p-2 border border-outline-variant/30 shadow-inner">
            <BrandLogo className="w-full h-full" />
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

  // View 3: Active SRS Review Interface
  return (
    <QuizSession
      questions={questions}
      sessionType="srs"
      filterKey={`srs:${currentAlgo}`}
      title={`Spaced repetition review (${currentAlgo})`}
      exitLabel={`Exit SRS Queue (${currentAlgo})`}
      onExit={() => navigate('/')}
    />
  );
};

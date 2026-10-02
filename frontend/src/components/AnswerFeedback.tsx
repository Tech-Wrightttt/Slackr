import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, ArrowRight, Clock, Star, Calendar } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { SRScheduleRecord } from '../db/schema';

interface AnswerFeedbackProps {
  isCorrect: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  correctDisplay: string;
  explanation: string;
  schedule?: SRScheduleRecord | null;
  timeSeconds: number;
  confidence?: number;
  onNext: () => void;
  hasNext: boolean;
}

export const AnswerFeedback: React.FC<AnswerFeedbackProps> = ({
  isCorrect,
  selectedAnswer,
  correctAnswer,
  correctDisplay,
  explanation,
  schedule,
  timeSeconds,
  confidence,
  onNext,
  hasNext,
}) => {
  // Listen for Space or Enter keyboard shortcut to advance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        // Prevent default scrolling when space is hit
        if (e.target === document.body || (e.target as HTMLElement).tagName === 'BUTTON') {
          e.preventDefault();
        }
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext]);

  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Result Status Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {isCorrect ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-7 w-7" />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <XCircle className="h-7 w-7" />
            </div>
          )}
          <div>
            <h3 className={`text-xl font-bold ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isCorrect ? 'Correct!' : 'Incorrect'}
            </h3>
            <p className="text-xs text-slate-400">
              Your answer: <span className="font-semibold text-slate-200 uppercase">{selectedAnswer}</span>
              {!isCorrect && (
                <>
                  {' '}
                  • Correct:{' '}
                  <span className="font-semibold text-emerald-400">{correctDisplay || correctAnswer.toUpperCase()}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Quick metrics & Next button */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
              {timeSeconds.toFixed(1)}s
            </span>
            {confidence !== undefined && (
              <span className="flex items-center gap-1 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">
                <Star className="h-3.5 w-3.5 text-amber-400" />
                Conf: {confidence}/5
              </span>
            )}
          </div>

          <button
            onClick={onNext}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:from-sky-400 hover:to-indigo-500 active:scale-95 transition-all"
          >
            <span>{hasNext ? 'Next Question' : 'Finish Quiz'}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* SRS Schedule Badge */}
      {schedule && (
        <div className="my-4 flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 text-xs text-indigo-300">
          <Calendar className="h-4 w-4 text-indigo-400" />
          <span>
            <strong>Spaced Repetition ({schedule.algorithm}):</strong> Next review scheduled for{' '}
            <strong>{new Date(schedule.nextReviewDate).toLocaleDateString()}</strong> (interval:{' '}
            {schedule.intervalDays} {schedule.intervalDays === 1 ? 'day' : 'days'})
          </span>
        </div>
      )}

      {/* Explanation Section */}
      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
          Step-by-Step Explanation
        </h4>
        {explanation ? (
          <MarkdownRenderer content={explanation} className="text-sm text-slate-300" />
        ) : (
          <p className="text-sm italic text-slate-500">No additional explanation text recorded.</p>
        )}
      </div>

      {/* Keyboard Shortcut Hint */}
      <div className="mt-6 flex justify-end text-[11px] text-slate-500">
        <span>Tip: Press <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300 border border-slate-700">Space</kbd> or <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-300 border border-slate-700">Enter</kbd> to advance</span>
      </div>
    </div>
  );
};

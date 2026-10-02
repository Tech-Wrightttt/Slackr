import React, { useEffect } from 'react';
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
    <div className="mt-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-4">
      {/* Result Status Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono-code font-bold text-lg shrink-0 ${
              isCorrect
                ? 'bg-mastery-emerald/15 text-mastery-emerald border border-mastery-emerald/30'
                : 'bg-error/15 text-error border border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {isCorrect ? 'check_circle' : 'cancel'}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-title-sm text-lg font-bold ${isCorrect ? 'text-mastery-emerald' : 'text-error'}`}>
                {isCorrect ? 'Correct Answer Verified' : 'Incorrect Choice'}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full font-label-caps text-[10px] uppercase font-bold tracking-wider ${
                  isCorrect
                    ? 'bg-mastery-emerald/20 text-mastery-emerald'
                    : 'bg-error/20 text-error'
                }`}
              >
                {isCorrect ? 'Passed (+1.25 pts)' : 'Review Required'}
              </span>
            </div>
            <p className="text-xs font-mono-code text-on-surface-variant mt-0.5">
              Candidate choice: <span className="font-bold text-on-surface uppercase">{selectedAnswer}</span>
              {!isCorrect && (
                <>
                  {' '}
                  • Official key:{' '}
                  <span className="font-bold text-primary">{correctDisplay || correctAnswer.toUpperCase()}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 text-xs font-mono-code text-on-surface-variant">
            <span className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded border border-outline-variant/30">
              <span className="material-symbols-outlined text-[14px] text-primary">timer</span>
              <span>{timeSeconds.toFixed(1)}s</span>
            </span>
            {confidence !== undefined && (
              <span className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded border border-outline-variant/30 text-confidence-amber">
                <span className="material-symbols-outlined text-[14px]">grade</span>
                <span>L{confidence}</span>
              </span>
            )}
          </div>

          <button
            onClick={onNext}
            className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-fixed-dim px-5 py-2.5 text-sm font-body-bold text-on-primary shadow-lg shadow-primary/20 active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span>{hasNext ? 'Proceed to Next' : 'Complete Session'}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Spaced Repetition Telemetry Strip */}
      {schedule && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-container px-3.5 py-2 border border-outline-variant/20 font-mono-code text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[16px]">sync</span>
          <span>
            Leitner Deck Adjusted: Next revision scheduled on{' '}
            <strong className="text-on-surface">{new Date(schedule.nextReviewDate).toLocaleDateString()}</strong> (
            interval: {schedule.intervalDays} {schedule.intervalDays === 1 ? 'day' : 'days'})
          </span>
        </div>
      )}

      {/* Detailed Analytical Breakdown / Explanation */}
      <div className="mt-1 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-label-caps text-on-surface-variant uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-primary">
            <span className="material-symbols-outlined text-[15px]">school</span>
            Official Analytical Breakdown
          </span>
          <span className="text-[11px] text-on-surface-variant/60 font-mono-code">IPA Syllabus Criteria</span>
        </div>

        <div className="rounded-lg bg-surface-container/60 p-4 border border-outline-variant/20 text-sm leading-relaxed text-on-surface font-body-base">
          {explanation ? (
            <MarkdownRenderer content={explanation} className="prose-p:my-1 text-sm text-on-surface" />
          ) : (
            <p className="italic text-on-surface-variant text-xs font-mono-code">
              Official key verified. Detailed step-by-step derivation available in curriculum handbook.
            </p>
          )}
        </div>
      </div>

      {/* Keyboard Shortcut Accelerator Footer */}
      <div className="flex items-center justify-between text-[11px] font-mono-code text-on-surface-variant/60 pt-1">
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-surface-container font-bold text-on-surface">Enter</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-surface-container font-bold text-on-surface">Space</kbd> to Advance</span>
        <span>Telemetry Logged</span>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { QuestionData } from '../db/schema';
import { DailySetService, DAILY_CHOICES, correctChoice, parseOptions, type DailySetState } from '../services/dailySet';
import { MarkdownRenderer } from './MarkdownRenderer';
import { topicLabel, topicStyle } from '../services/topicColors';

interface DailySetModalProps {
  state: DailySetState;
  questions: QuestionData[];
  onStateChange: (state: DailySetState) => void;
  onClose: () => void;
}

export const DailySetModal: React.FC<DailySetModalProps> = ({ state, questions, onStateChange, onClose }) => {
  // Resume at the first unanswered question
  const firstOpen = questions.findIndex((q) => !state.answers[q.id]);
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length : firstOpen);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(Date.now());
  const dialogRef = useRef<HTMLDivElement>(null);

  const done = index >= questions.length;
  const question = done ? null : questions[index];
  const answer = question ? state.answers[question.id] : undefined;
  const correctCount = questions.filter((q) => state.answers[q.id]?.isCorrect).length;

  useEffect(() => {
    startedAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    dialogRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const choose = useCallback(
    async (key: string) => {
      if (!question || answer || saving) return;
      setSaving(true);
      try {
        const next = await DailySetService.answer(state, question, key, (Date.now() - startedAt.current) / 1000);
        onStateChange(next);
      } finally {
        setSaving(false);
      }
    },
    [question, answer, saving, state, onStateChange]
  );

  const advance = useCallback(() => {
    if (answer) setIndex((i) => i + 1);
  }, [answer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (done) return;
    const k = e.key.toLowerCase();
    const byNumber = ['1', '2', '3', '4'].indexOf(k);
    if (byNumber !== -1) choose(DAILY_CHOICES[byNumber]!);
    else if ((DAILY_CHOICES as readonly string[]).includes(k)) choose(k);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      advance();
    }
  };

  const options = question ? parseOptions(question) : {};
  const rightKey = question ? correctChoice(question) : null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="daily-backdrop absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-set-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="daily-dialog relative w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-confidence-amber">wb_sunny</span>
            <h2 id="daily-set-title" className="text-sm font-semibold text-on-surface">
              Daily Set
            </h2>
            <div className="flex items-center gap-1" aria-label={`${Object.keys(state.answers).length} of ${questions.length} answered`}>
              {questions.map((q, i) => {
                const a = state.answers[q.id];
                return (
                  <span
                    key={q.id}
                    className={`h-1.5 rounded-full ${i === index ? 'w-4' : 'w-1.5'} ${
                      a ? (a.isCorrect ? 'bg-mastery-emerald' : 'bg-error') : i === index ? 'bg-on-surface' : 'bg-outline-variant'
                    }`}
                    style={{ transition: 'width 200ms var(--ease-out), background-color 150ms ease' }}
                  />
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close daily set"
            className="press-scale w-10 h-10 -mr-2 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4">
          {question ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 font-mono-code text-[11px] text-on-surface-variant">
                <span className="topic-tile px-2 py-0.5 rounded-full font-semibold" style={topicStyle(question.topics?.[0] || 'software')}>
                  {topicLabel(question.topics?.[0] || 'software')}
                </span>
                <span>{question.id}</span>
              </div>

              <MarkdownRenderer content={question.question} className="text-sm leading-relaxed text-on-surface" />

              <div className="flex flex-col gap-2">
                {DAILY_CHOICES.map((key, i) => {
                  const isPicked = answer?.selected === key;
                  const isRight = !!answer && key === rightKey;
                  const tone = isRight
                    ? 'border-mastery-emerald/60 bg-mastery-emerald/10'
                    : isPicked
                    ? 'border-error/60 bg-error/10'
                    : answer
                    ? 'border-outline-variant/30 opacity-60'
                    : 'border-outline-variant/40 hover:bg-surface-container hover:border-outline-variant';
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!!answer || saving}
                      onClick={() => choose(key)}
                      className={`daily-choice min-h-[48px] flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm text-on-surface cursor-pointer disabled:cursor-default ${tone}`}
                    >
                      <span
                        className={`mt-px w-6 h-6 shrink-0 rounded-md flex items-center justify-center font-mono-code text-xs font-bold uppercase ${
                          isRight
                            ? 'bg-mastery-emerald text-white'
                            : isPicked
                            ? 'bg-error text-white'
                            : 'bg-surface-container-high text-on-surface-variant'
                        }`}
                        aria-hidden="true"
                      >
                        {isRight ? '✓' : isPicked ? '✕' : key}
                      </span>
                      <span className="sr-only">Option {i + 1}:</span>
                      <MarkdownRenderer content={options[key] ?? ''} className="min-w-0 leading-relaxed" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-mastery-emerald/15 text-mastery-emerald flex items-center justify-center">
                <span className="material-symbols-outlined text-[30px]">task_alt</span>
              </div>
              <div>
                <p className="text-lg font-bold text-on-surface">
                  {correctCount} / {questions.length} correct
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">Today's set is done. A new one unlocks tomorrow.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                {questions.map((q) => (
                  <Link
                    key={q.id}
                    to={`/history/${encodeURIComponent(q.id)}`}
                    onClick={onClose}
                    className={`press-scale px-2 py-1 rounded-lg font-mono-code text-[11px] border ${
                      state.answers[q.id]?.isCorrect
                        ? 'border-mastery-emerald/40 text-mastery-emerald'
                        : 'border-error/40 text-error'
                    }`}
                  >
                    {q.id}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer: on phones the dialog is a bottom sheet, so keep actions clear of the home indicator */}
        <div
          className="flex items-center justify-between gap-3 px-5 pt-3 border-t border-outline-variant/20"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <span className="font-mono-code text-[11px] text-on-surface-variant">
            {done ? 'Counts toward your tracker' : answer ? (answer.isCorrect ? 'Correct' : `Answer: ${rightKey?.toUpperCase()}`) : 'Press 1–4 or A–D'}
          </span>
          {done ? (
            <button
              type="button"
              onClick={onClose}
              className="press-scale min-h-[44px] px-5 rounded-lg bg-primary text-on-primary text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={advance}
              disabled={!answer}
              className="press-scale min-h-[44px] px-5 rounded-lg bg-primary text-on-primary text-xs font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-default flex items-center gap-1"
            >
              {index === questions.length - 1 ? 'Finish' : 'Next'}
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

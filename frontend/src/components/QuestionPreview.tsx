import React, { useState } from 'react';
import { Sheet } from './Sheet';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ZoomableImage } from './ZoomableImage';
import { topicLabel } from '../services/topicColors';
import type { QuestionData } from '../db/schema';

interface QuestionPreviewProps {
  question: QuestionData;
  /** 1-based place in the list being browsed */
  position: number;
  total: number;
  selected: boolean;
  onToggleSelect: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
}

/** Read-only look at a question from the Custom Builder: stem, diagrams, choices, and the answer on request. */
export const QuestionPreview: React.FC<QuestionPreviewProps> = ({
  question: q,
  position,
  total,
  selected,
  onToggleSelect,
  onPrev,
  onNext,
  onClose,
}) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const options = Object.entries(q.options || {}).filter(([, text]) => text?.trim());
  const diagramOnly = options.length === 0 && (q.fallback_choices?.length ?? 0) > 0;

  // Answer stays hidden when moving to another question
  const go = (fn?: () => void) => () => {
    setShowAnswer(false);
    fn?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft' && onPrev) {
      e.preventDefault();
      go(onPrev)();
    } else if (e.key === 'ArrowRight' && onNext) {
      e.preventDefault();
      go(onNext)();
    }
  };

  const navButton = 'tap flex h-11 w-11 items-center justify-center rounded-xl text-on-surface hover:bg-surface-container disabled:opacity-30 cursor-pointer';

  return (
    <Sheet
      title={q.id}
      subtitle={`${position.toLocaleString()} of ${total.toLocaleString()} · ← → to browse`}
      icon="visibility"
      size="xl"
      onClose={onClose}
      onKeyDown={handleKeyDown}
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button type="button" onClick={go(onPrev)} disabled={!onPrev} aria-label="Previous question" className={navButton}>
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_left</span>
            </button>
            <button type="button" onClick={go(onNext)} disabled={!onNext} aria-label="Next question" className={navButton}>
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_right</span>
            </button>
          </div>
          <button
            type="button"
            data-autofocus
            onClick={onToggleSelect}
            aria-pressed={selected}
            className={`press-scale min-h-[44px] flex items-center gap-2 rounded-xl px-5 text-sm font-semibold cursor-pointer ${
              selected
                ? 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest'
                : 'bg-primary text-on-primary hover:bg-primary-fixed-dim'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              {selected ? 'remove' : 'add'}
            </span>
            {selected ? 'Remove from set' : 'Add to set'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {(q.topics?.length ? q.topics : ['software']).map((t) => (
            <span key={t} className="rounded bg-surface-container-high px-2 py-0.5 text-tertiary">
              {topicLabel(t)}
            </span>
          ))}
          <span className="rounded bg-surface-container-high px-2 py-0.5 text-on-surface-variant">
            {q.kind === 'solving' ? 'Solving' : 'Recall'}
          </span>
          {(q.repeat_count ?? 1) >= 2 && (
            <span className="rounded bg-confidence-amber/15 px-2 py-0.5 font-semibold text-confidence-amber">
              Asked in {q.repeat_count} years
            </span>
          )}
        </div>

        {q.question ? (
          <div className="font-body-stem text-[15px] sm:text-base leading-relaxed text-on-surface break-words">
            <MarkdownRenderer content={q.question} className="md-flow" />
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">This question is a diagram.</p>
        )}

        {q.image_paths?.length > 0 && !q.question.includes('/files/') && (
          <div className="flex flex-col gap-3">
            {q.image_paths.map((src, i) => (
              <ZoomableImage key={src} src={src} alt={`${q.id} diagram ${i + 1}`} title={`${q.id} diagram`} />
            ))}
          </div>
        )}

        {options.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Choices">
            {options.map(([key, text]) => (
              <li key={key} className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-low p-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-surface-container-high font-mono-code text-xs font-bold uppercase text-on-surface">
                  {key}
                </span>
                <div className="min-w-0 flex-1 font-mono-code text-sm break-words">
                  <MarkdownRenderer content={text} className="prose-p:my-0 text-sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {diagramOnly && (
          <p className="text-xs text-on-surface-variant">
            Choices {q.fallback_choices.map((c) => c.toUpperCase()).join(', ')} are in the diagram.
          </p>
        )}

        <div className="rounded-xl border border-outline-variant/30">
          <button
            type="button"
            onClick={() => setShowAnswer((v) => !v)}
            aria-expanded={showAnswer}
            className="tap flex w-full min-h-[44px] items-center justify-between gap-2 px-4 text-sm font-semibold text-on-surface cursor-pointer"
          >
            {showAnswer ? 'Hide answer' : 'Show answer and explanation'}
            <span className={`material-symbols-outlined text-[18px] transition-transform ${showAnswer ? 'rotate-180' : ''}`} aria-hidden="true">
              expand_more
            </span>
          </button>
          {showAnswer && (
            <div className="flex flex-col gap-3 border-t border-outline-variant/20 px-4 py-3">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-mastery-emerald">Answer</span>
                <MarkdownRenderer content={q.correct_display || q.correct} className="text-sm" />
              </div>
              {q.explanation && <MarkdownRenderer content={q.explanation} className="text-sm" />}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { QuestionData, SessionType } from '../db/schema';
import { examMinutesFor, type ExamSetSpec } from '../services/examService';
import { isSelfGraded } from '../services/choiceOrder';

interface ExamLaunchButtonProps {
  /** The set, or `load` to fetch it on click when the page has not loaded it yet */
  questions?: QuestionData[];
  load?: () => Promise<QuestionData[]>;
  setKey: string;
  title: string;
  sessionType: SessionType;
  filterKey: string;
  /** Overrides the default sitting length (official paper duration, else 1.5 min per question) */
  minutes?: number;
  className?: string;
  compact?: boolean;
  /** Shorter text where space is tight (phones, two-up button rows) */
  label?: string;
}

/** Builds the exam for a set and opens it. Cards that can only be self-graded are left out. */
export const buildExamSpec = (
  questions: QuestionData[],
  meta: Omit<ExamSetSpec, 'questionIds' | 'minutes'> & { minutes?: number }
): ExamSetSpec => {
  const gradable = questions.filter((q) => !isSelfGraded(q));
  const papers = new Set(gradable.map((q) => q.session_id || q.paper));
  const paper = papers.size === 1 ? gradable[0]?.paper : undefined;
  return {
    ...meta,
    questionIds: gradable.map((q) => q.id),
    minutes: meta.minutes ?? examMinutesFor(paper, gradable.length),
  };
};

export const ExamLaunchButton: React.FC<ExamLaunchButtonProps> = ({
  questions,
  load,
  setKey,
  title,
  sessionType,
  filterKey,
  minutes,
  className = '',
  compact = false,
  label = 'Take as timed exam',
}) => {
  const navigate = useNavigate();
  const disabled = !load && !questions?.length;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async (e) => {
        e.stopPropagation();
        const list = questions ?? (await load!());
        if (!list.length) return;
        const exam = buildExamSpec(list, { setKey, title, sessionType, filterKey, minutes });
        navigate('/quiz/exam', { state: { exam } });
      }}
      title="Move freely, no feedback until the end, one attempt until reset"
      className={`press-scale inline-flex items-center justify-center gap-1.5 rounded-lg border border-tertiary/35 bg-tertiary/8 font-body-bold text-tertiary shadow-sm hover:border-tertiary/60 hover:bg-tertiary/14 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
        compact ? 'tap min-h-[36px] px-3 text-xs' : 'min-h-[44px] px-4 text-sm'
      } ${className}`}
    >
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">timer</span>
      {label}
    </button>
  );
};

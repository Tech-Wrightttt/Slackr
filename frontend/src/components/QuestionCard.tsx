import React, { useState, useEffect, useRef } from 'react';
import { Clock, Star, AlertCircle, HelpCircle, Check, ZoomIn } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ZoomableImage } from './ZoomableImage';
import { AnswerFeedback } from './AnswerFeedback';
import type { QuestionData, SRScheduleRecord } from '../db/schema';
import { useStore } from '../store/useStore';

interface QuestionCardProps {
  question: QuestionData;
  questionNumber: number;
  totalQuestions: number;
  onAnswerSubmitted: (
    questionId: string,
    topic: string,
    selectedAnswer: string,
    isCorrect: boolean,
    timeSeconds: number,
    confidence: number
  ) => Promise<{ schedule: SRScheduleRecord }>;
  onNextQuestion: () => void;
  hasNext: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  questionNumber,
  totalQuestions,
  onAnswerSubmitted,
  onNextQuestion,
  hasNext,
}) => {
  const { confidenceTracking, showTimer } = useStore();

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(3);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [schedule, setSchedule] = useState<SRScheduleRecord | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(true);

  // Timer reference
  const startTimeRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<any>(null);

  // Reset state when new question loads
  useEffect(() => {
    setSelectedChoice(null);
    setConfidence(3);
    setIsSubmitted(false);
    setIsCorrect(false);
    setSchedule(null);
    setElapsedTime(0);
    setTimerRunning(true);
    startTimeRef.current = Date.now();

    timerIntervalRef.current = setInterval(() => {
      setElapsedTime((Date.now() - startTimeRef.current) / 1000);
    }, 100);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [question.id]);

  // Handle choice submission
  const handleSubmit = async () => {
    if (!selectedChoice || isSubmitted) return;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setTimerRunning(false);
    const finalTime = (Date.now() - startTimeRef.current) / 1000;

    // Check correctness:
    // Normalize both user choice and question.correct
    const cleanUserChoice = selectedChoice.trim().toLowerCase();
    const cleanCorrect = (question.correct || '').trim().toLowerCase();
    
    // For single letters: e.g. "c" == "c"
    // For multi-answers: e.g. user answered "c", correct is "c) 291.25"
    let correct = cleanUserChoice === cleanCorrect;
    if (!correct && cleanCorrect.startsWith(cleanUserChoice + ')')) {
      correct = true;
    } else if (!correct && cleanCorrect.startsWith(cleanUserChoice + '.')) {
      correct = true;
    }

    setIsCorrect(correct);
    setIsSubmitted(true);

    const topic = question.topics?.[0] || 'software';
    const result = await onAnswerSubmitted(
      question.id,
      topic,
      selectedChoice,
      correct,
      finalTime,
      confidenceTracking ? confidence : 3
    );

    if (result && result.schedule) {
      setSchedule(result.schedule);
    }
  };

  // Keyboard shortcut handler for 1-4, A-D, and Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitted) return;

      const key = e.key.toLowerCase();
      // Handle letter keys A, B, C, D, E, F
      if (['a', 'b', 'c', 'd', 'e', 'f'].includes(key)) {
        setSelectedChoice(key);
      }
      // Handle number keys 1=A, 2=B, 3=C, 4=D
      if (['1', '2', '3', '4'].includes(key)) {
        const mapNumToLetter: Record<string, string> = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
        setSelectedChoice(mapNumToLetter[key]);
      }
      // Submit on Enter if a choice is picked
      if (e.key === 'Enter' && selectedChoice) {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedChoice, isSubmitted, question]);

  const hasOptionsDict = question.options && Object.keys(question.options).length > 0;
  const choicesList = hasOptionsDict
    ? Object.entries(question.options)
    : (question.fallback_choices || ['a', 'b', 'c', 'd']).map((ch) => [ch, '']);

  const confidenceLevels = [
    { value: 1, label: 'Wild Guess', desc: '10-20% sure' },
    { value: 2, label: 'Low', desc: '30-40% sure' },
    { value: 3, label: 'Moderate', desc: '50-60% sure' },
    { value: 4, label: 'Confident', desc: '70-80% sure' },
    { value: 5, label: '100% Certain', desc: '90-100% sure' },
  ];

  return (
    <div className="mx-auto max-w-4xl animate-in fade-in duration-300">
      {/* Question Header & Meta */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 border border-sky-500/20">
            {question.id}
          </span>
          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300">
            Year {question.year}
          </span>
          {question.paper && (
            <span className="rounded-lg bg-slate-800/80 px-2 py-1 text-xs text-slate-400">
              {question.paper}
            </span>
          )}
          {question.topics?.map((top) => (
            <span
              key={top}
              className="rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300 border border-indigo-500/20"
            >
              {top}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
          {showTimer && (
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-800/80 px-3 py-1.5 text-slate-300 border border-slate-700/50">
              <Clock className="h-3.5 w-3.5 text-sky-400" />
              <span className="font-mono">{elapsedTime.toFixed(1)}s</span>
            </div>
          )}
          <div className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-300">
            Question <span className="font-bold text-white">{questionNumber}</span> of {totalQuestions}
          </div>
        </div>
      </div>

      {/* Main Question Body */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-md">
        {/* Render question stem */}
        {question.question && (
          <div className="text-base leading-relaxed text-slate-100 sm:text-lg mb-6">
            <MarkdownRenderer content={question.question} />
          </div>
        )}

        {/* If question has diagrams not already embedded in the markdown text */}
        {question.image_paths?.length > 0 && !question.question.includes('/files/') && (
          <div className="my-6 space-y-4">
            {question.image_paths.map((imgUrl, idx) => (
              <div key={idx} className="flex justify-center">
                <ZoomableImage
                  src={imgUrl}
                  alt={`Question Diagram ${idx + 1}`}
                  className="max-h-[500px]"
                />
              </div>
            ))}
          </div>
        )}

        {/* Options Selection */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            <span>Select Your Answer</span>
            <span className="text-[11px] lowercase text-slate-500">Keyboard: 1-4 or A-D</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {choicesList.map(([key, optText]) => {
              const isSelected = selectedChoice === key;
              const isChoiceCorrect = isSubmitted && (
                question.correct.toLowerCase() === key ||
                question.correct.toLowerCase().startsWith(key + ')') ||
                question.correct.toLowerCase().startsWith(key + '.')
              );
              const isChoiceWrong = isSubmitted && isSelected && !isCorrect;

              let styleClasses = 'border-slate-800 bg-slate-950/60 hover:bg-slate-800 hover:border-slate-700 text-slate-200';
              if (isSelected && !isSubmitted) {
                styleClasses = 'border-sky-500 bg-sky-500/10 text-sky-300 ring-2 ring-sky-500/30';
              } else if (isChoiceCorrect) {
                styleClasses = 'border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-2 ring-emerald-500/40';
              } else if (isChoiceWrong) {
                styleClasses = 'border-rose-500 bg-rose-500/15 text-rose-300 ring-2 ring-rose-500/40';
              }

              return (
                <button
                  key={key}
                  disabled={isSubmitted}
                  onClick={() => setSelectedChoice(key)}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all active:scale-[0.99] disabled:cursor-default ${styleClasses}`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold uppercase transition-colors ${
                      isSelected && !isSubmitted
                        ? 'bg-sky-500 text-white'
                        : isChoiceCorrect
                        ? 'bg-emerald-500 text-white'
                        : isChoiceWrong
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {key}
                  </div>
                  <div className="min-w-0 flex-1 pt-1 text-sm font-medium">
                    {optText ? (
                      <MarkdownRenderer content={optText} className="prose-p:my-0 text-sm" />
                    ) : (
                      <span className="font-semibold text-slate-300">Option {key.toUpperCase()}</span>
                    )}
                  </div>
                  {isChoiceCorrect && (
                    <Check className="h-5 w-5 text-emerald-400 shrink-0 self-center" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pre-Reveal Confidence Calibration Selector */}
        {confidenceTracking && !isSubmitted && (
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <Star className="h-4 w-4 text-amber-400" />
                <span>Pre-Answer Confidence Rating</span>
              </label>
              <span className="text-[11px] text-slate-500">Rate your certainty before submitting</span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {confidenceLevels.map((lvl) => {
                const isSelected = confidence === lvl.value;
                return (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => setConfidence(lvl.value)}
                    className={`flex flex-col items-center justify-center rounded-lg border py-2.5 px-1 text-center transition-all ${
                      isSelected
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300 ring-2 ring-amber-500/30'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-0.5 text-xs font-bold">
                      <span>{lvl.value}</span>
                      <Star className={`h-3 w-3 ${isSelected ? 'fill-amber-400 text-amber-400' : 'text-slate-500'}`} />
                    </div>
                    <span className="text-[11px] font-medium leading-tight mt-1">{lvl.label}</span>
                    <span className="text-[9px] text-slate-500 leading-tight hidden sm:block">{lvl.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Submit Action Button */}
        {!isSubmitted && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={!selectedChoice}
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              <span>Submit Answer</span>
            </button>
          </div>
        )}

        {/* Feedback Section (Shown after submission) */}
        {isSubmitted && (
          <AnswerFeedback
            isCorrect={isCorrect}
            selectedAnswer={selectedChoice || ''}
            correctAnswer={question.correct}
            correctDisplay={question.correct_display}
            explanation={question.explanation}
            schedule={schedule}
            timeSeconds={elapsedTime}
            confidence={confidenceTracking ? confidence : undefined}
            onNext={onNextQuestion}
            hasNext={hasNext}
          />
        )}
      </div>
    </div>
  );
};

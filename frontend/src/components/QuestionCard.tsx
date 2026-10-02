import React, { useState, useEffect, useRef } from 'react';
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
  onPreviousQuestion?: () => void;
  onSkipQuestion?: () => void;
  hasNext: boolean;
  hasPrevious?: boolean;
  questions?: QuestionData[];
  currentIndex?: number;
  onSelectIndex?: (index: number) => void;
  attemptStatusMap?: Record<string, { isCorrect: boolean }>;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  questionNumber,
  totalQuestions,
  onAnswerSubmitted,
  onNextQuestion,
  onPreviousQuestion,
  onSkipQuestion,
  hasNext,
  hasPrevious = false,
  questions = [],
  currentIndex = 0,
  onSelectIndex,
  attemptStatusMap = {},
}) => {
  const { confidenceTracking, showTimer } = useStore();

  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number>(4);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [schedule, setSchedule] = useState<SRScheduleRecord | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [bookmarked, setBookmarked] = useState<boolean>(false);

  // Local answer record cache for grid pills
  const [sessionAnswerMap, setSessionAnswerMap] = useState<Record<string, { isCorrect: boolean }>>({});

  // Timer reference
  const startTimeRef = useRef<number>(Date.now());
  const timerIntervalRef = useRef<any>(null);

  // Reset state when new question loads
  useEffect(() => {
    setSelectedChoice(null);
    setConfidence(4);
    setIsSubmitted(false);
    setIsCorrect(false);
    setSchedule(null);
    setElapsedTime(0);
    startTimeRef.current = Date.now();

    // Check if bookmarked
    const savedBookmarks = JSON.parse(localStorage.getItem('slackr_bookmarks') || '[]');
    setBookmarked(savedBookmarks.includes(question.id));

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
    const finalTime = (Date.now() - startTimeRef.current) / 1000;

    // Check correctness:
    const cleanUserChoice = selectedChoice.trim().toLowerCase();
    const cleanCorrect = (question.correct || '').trim().toLowerCase();

    let correct = cleanUserChoice === cleanCorrect;
    if (!correct && cleanCorrect.startsWith(cleanUserChoice + ')')) {
      correct = true;
    } else if (!correct && cleanCorrect.startsWith(cleanUserChoice + '.')) {
      correct = true;
    }

    setIsCorrect(correct);
    setIsSubmitted(true);
    setSessionAnswerMap((prev) => ({
      ...prev,
      [question.id]: { isCorrect: correct },
    }));

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

  const toggleBookmark = () => {
    const savedBookmarks: string[] = JSON.parse(localStorage.getItem('slackr_bookmarks') || '[]');
    let updated: string[];
    if (savedBookmarks.includes(question.id)) {
      updated = savedBookmarks.filter((id) => id !== question.id);
      setBookmarked(false);
    } else {
      updated = [...savedBookmarks, question.id];
      setBookmarked(true);
    }
    localStorage.setItem('slackr_bookmarks', JSON.stringify(updated));
  };

  // Keyboard shortcut handler for 1-4, A-D, Enter, Arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitted) return;

      const key = e.key.toLowerCase();
      if (['a', 'b', 'c', 'd', 'e', 'f'].includes(key)) {
        setSelectedChoice(key);
      }
      if (['1', '2', '3', '4'].includes(key)) {
        const mapNumToLetter: Record<string, string> = { '1': 'a', '2': 'b', '3': 'c', '4': 'd' };
        setSelectedChoice(mapNumToLetter[key]);
      }
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
    { value: 1, label: 'Guess', desc: 'L1' },
    { value: 2, label: 'Unsure', desc: 'L2' },
    { value: 3, label: 'Moderate', desc: 'L3' },
    { value: 4, label: 'Solid', desc: 'L4' },
    { value: 5, label: 'Certain', desc: 'L5' },
  ];

  // Helper for timer format MMm SSs
  const formatTimer = (sec: number) => {
    const mins = String(Math.floor(sec / 60)).padStart(2, '0');
    const secs = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${mins}m ${secs}s`;
  };

  // Build list of all question items for the navigator
  const totalItemCount = totalQuestions || questions.length || 80;
  const combinedAnswerMap = { ...attemptStatusMap, ...sessionAnswerMap };

  // Calculate stats for right-hand ticker
  const answeredKeys = Object.keys(combinedAnswerMap);
  const correctCount = answeredKeys.filter((k) => combinedAnswerMap[k]?.isCorrect).length;
  const incorrectCount = answeredKeys.filter((k) => combinedAnswerMap[k] && !combinedAnswerMap[k]?.isCorrect).length;
  const pendingCount = Math.max(0, totalItemCount - correctCount - incorrectCount);
  const progressPercent = Math.min(100, Math.round((questionNumber / totalItemCount) * 100));

  return (
    <div className="w-full flex flex-col gap-4 animate-in fade-in duration-300">
      {/* Telemetry Bar & Context Rail */}
      <div className="w-full rounded-xl bg-surface-container-low border border-outline-variant/30 px-4 py-2.5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container font-mono-code text-xs text-on-surface-variant">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {question.year} {question.season_title || question.season || 'Annual'}
            </span>
            <span className="text-on-surface-variant/40 font-mono-code text-xs">•</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-caps text-xs uppercase tracking-wider">
              {question.paper || 'Subject A'}
            </span>
            <span className="text-on-surface-variant/40 font-mono-code text-xs">•</span>
            <span className="font-mono-code text-xs text-on-surface font-semibold">
              Question {questionNumber} of {totalItemCount}
            </span>
            <div className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-high/60 font-label-caps text-[10px] text-secondary">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              PHILNITS FE / AP
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* Elapsed Timer */}
            {showTimer && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-surface-container font-mono-timer text-xs text-confidence-amber border border-outline-variant/20">
                <span className="material-symbols-outlined text-[15px]">timer</span>
                <span>{formatTimer(elapsedTime)}</span>
              </div>
            )}

            {/* Target Pace Pacer */}
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low font-mono-code text-xs text-on-surface-variant border border-outline-variant/20">
              <span className="text-on-surface-variant/60">Pace:</span>
              <span className="text-mastery-emerald font-body-bold">
                {elapsedTime < 90 ? 'Optimal (+25s)' : elapsedTime < 150 ? 'On Track' : 'Caution'}
              </span>
            </div>

            {/* Bookmark Trigger */}
            <button
              type="button"
              onClick={toggleBookmark}
              aria-label="Bookmark Question"
              className={`p-1.5 rounded bg-surface-container hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer ${
                bookmarked ? 'text-confidence-amber' : 'text-on-surface-variant hover:text-on-surface'
              }`}
              title={bookmarked ? 'Remove Bookmark' : 'Bookmark Question'}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={bookmarked ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                bookmark
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Assessment Workspace Layout (2 Columns) */}
      <div className="w-full flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Core Focus Canvas (Stem, Schematic, Choices, Action Bar) (8 cols / 65%) */}
        <div className="w-full lg:w-8/12 flex flex-col gap-4">
          {/* Metadata Tag Strip & Paper Subheader */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container font-mono-code text-xs text-secondary border border-outline-variant/20">
              <span className="material-symbols-outlined text-[15px] text-primary">calendar_month</span>
              {question.year} {question.season_title || question.season || 'Examination Paper'}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-widest">
                Category:
              </span>
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-tertiary font-mono-code text-xs capitalize">
                {question.topics?.[0] || 'Computer Architecture'}
              </span>
            </div>
          </div>

          {/* Question Card Container */}
          <div className="w-full rounded-xl bg-obsidian-surface-card dark:bg-obsidian-surface-card bg-surface-container-low p-5 sm:p-6 flex flex-col gap-5 shadow-xl border border-outline-variant/20">
            {/* Question Stem Heading */}
            <div className="flex items-start gap-3">
              <span className="px-2.5 py-1 rounded bg-surface-container-high text-primary font-mono-code text-xs font-body-bold shrink-0">
                Q{question.number || questionNumber}
              </span>
              <div className="font-body-stem text-base sm:text-[17px] text-on-surface leading-relaxed flex-1">
                {question.question && <MarkdownRenderer content={question.question} />}
              </div>
            </div>

            {/* Technical Schematic Diagram Viewport (Zoomable Box) */}
            {question.image_paths?.length > 0 && !question.question.includes('/files/') && (
              <div className="my-2 space-y-3">
                {question.image_paths.map((imgUrl, idx) => (
                  <ZoomableImage
                    key={idx}
                    src={imgUrl}
                    alt={`Question Schematic Diagram ${idx + 1}`}
                    title={`Question ${question.number || questionNumber} Diagram`}
                  />
                ))}
              </div>
            )}

            {/* Multiple Choice Options Matrix */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
                  Select Candidate Answer
                </span>
                <span className="font-mono-code text-on-surface-variant/70 text-xs hidden sm:inline">
                  Shortcut: Keys 1 to 4 or A to D
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {choicesList.map(([key, optText], idx) => {
                  const isSelected = selectedChoice === key;
                  const isChoiceCorrect =
                    isSubmitted &&
                    (question.correct.toLowerCase() === key ||
                      question.correct.toLowerCase().startsWith(key + ')') ||
                      question.correct.toLowerCase().startsWith(key + '.'));
                  const isChoiceWrong = isSubmitted && isSelected && !isCorrect;

                  let cardStyle =
                    'bg-surface-container-low hover:bg-surface-container text-on-surface-variant border border-outline-variant/20';

                  if (isChoiceCorrect) {
                    cardStyle =
                      'bg-primary-container text-on-primary shadow-lg border border-primary-container ring-1 ring-primary/40';
                  } else if (isChoiceWrong) {
                    cardStyle =
                      'bg-error/15 text-error shadow-md border border-error/30 ring-1 ring-error/40';
                  } else if (isSelected && !isSubmitted) {
                    cardStyle =
                      'bg-surface-container-high text-on-surface ring-2 ring-primary/50 border border-primary/40';
                  }

                  return (
                    <div
                      key={key}
                      onClick={() => !isSubmitted && setSelectedChoice(key)}
                      className={`group relative flex items-center gap-3.5 p-3.5 rounded-lg cursor-pointer transition-all ${cardStyle}`}
                    >
                      <div
                        className={`w-8 h-8 rounded flex items-center justify-center font-mono-code text-sm font-bold uppercase shrink-0 transition-colors ${
                          isChoiceCorrect
                            ? 'bg-on-primary-container text-primary-container'
                            : isChoiceWrong
                            ? 'bg-error text-white'
                            : isSelected && !isSubmitted
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-high text-on-surface group-hover:bg-surface-variant'
                        }`}
                      >
                        {key}
                      </div>

                      <div className="flex-1 font-mono-code text-sm">
                        {optText ? (
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <MarkdownRenderer content={optText} className="prose-p:my-0 text-sm" />
                            {isChoiceCorrect && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-fixed-dim/20 text-primary-fixed font-label-caps text-[10px] uppercase tracking-wider shrink-0 w-fit">
                                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                Key Verified Answer
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span>Option {key.toUpperCase()}</span>
                            {isChoiceCorrect && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-fixed-dim/20 text-primary-fixed font-label-caps text-[10px] uppercase tracking-wider shrink-0">
                                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                Key Verified Answer
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-surface-container font-mono-code text-[11px] text-on-surface-variant/60">
                        [{idx + 1}]
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confidence Calibration Strip */}
            {confidenceTracking && !isSubmitted && (
              <div className="pt-2 flex flex-col gap-2">
                <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-xs uppercase tracking-wider">
                  <span>Metacognitive Calibration</span>
                  <span className="text-confidence-amber flex items-center gap-1 font-mono-code">
                    <span className="material-symbols-outlined text-[14px]">grade</span>
                    Level {confidence}: {confidenceLevels.find((l) => l.value === confidence)?.label}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {confidenceLevels.map((lvl) => {
                    const isSelected = confidence === lvl.value;
                    return (
                      <button
                        key={lvl.value}
                        type="button"
                        onClick={() => setConfidence(lvl.value)}
                        className={`py-2 px-1 rounded font-mono-code text-xs flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-confidence-amber/20 text-confidence-amber font-body-bold shadow-[0_0_12px_rgba(245,158,11,0.2)] border border-confidence-amber/40 ring-1 ring-confidence-amber/30'
                            : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20'
                        }`}
                      >
                        <span className={`text-[10px] ${isSelected ? 'text-confidence-amber font-bold' : 'text-on-surface-variant/60'}`}>
                          {lvl.value}
                        </span>
                        <span className="truncate text-[11px]">{lvl.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Navigation Action Footer */}
            <div className="flex items-center justify-between pt-2 gap-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={onPreviousQuestion}
                disabled={!hasPrevious && currentIndex === 0}
                className="px-4 py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-2 sm:gap-3">
                {onSkipQuestion && !isSubmitted && (
                  <button
                    type="button"
                    onClick={onSkipQuestion}
                    className="px-4 py-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-base text-sm transition-colors cursor-pointer border border-outline-variant/20"
                  >
                    <span>Skip</span>
                  </button>
                )}

                {!isSubmitted ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!selectedChoice}
                    className="px-5 py-2.5 rounded-lg bg-primary text-on-primary hover:bg-primary-fixed-dim font-body-bold text-sm flex items-center gap-2 shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>Submit &amp; Proceed</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onNextQuestion}
                    className="px-5 py-2.5 rounded-lg bg-primary text-on-primary hover:bg-primary-fixed-dim font-body-bold text-sm flex items-center gap-2 shadow-lg transition-transform active:scale-[0.98] cursor-pointer"
                  >
                    <span>{hasNext ? 'Next Question' : 'Finish Quiz'}</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                )}
              </div>
            </div>

            {/* Feedback & Explanation Section */}
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

        {/* Right Column: Chronological 80-Question Rail (4 cols / 35%) */}
        <div className="w-full lg:w-4/12 flex flex-col gap-4">
          {/* Session Telemetry Summary Card */}
          <div className="rounded-xl bg-obsidian-surface-card dark:bg-obsidian-surface-card bg-surface-container-low p-4 flex flex-col gap-3 shadow-xl border border-outline-variant/20">
            <div className="flex items-center justify-between pb-1">
              <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
                Exam Progress Gauge
              </span>
              <span className="font-mono-code text-xs text-primary font-body-bold">
                {questionNumber} / {totalItemCount} ({progressPercent}%)
              </span>
            </div>

            {/* Progress Bar Meter */}
            <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>

            {/* Score & Precision Ticker Grid */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono-code text-center">
              <div className="p-2 rounded bg-surface-container-low border border-outline-variant/20 flex flex-col">
                <span className="text-mastery-emerald font-body-bold text-sm">{correctCount}</span>
                <span className="text-[10px] text-on-surface-variant/70 uppercase">Correct</span>
              </div>
              <div className="p-2 rounded bg-surface-container-low border border-outline-variant/20 flex flex-col">
                <span className="text-error font-body-bold text-sm">{incorrectCount}</span>
                <span className="text-[10px] text-on-surface-variant/70 uppercase">Review</span>
              </div>
              <div className="p-2 rounded bg-surface-container-low border border-outline-variant/20 flex flex-col">
                <span className="text-on-surface-variant font-body-bold text-sm">{pendingCount}</span>
                <span className="text-[10px] text-on-surface-variant/70 uppercase">Pending</span>
              </div>
            </div>
          </div>

          {/* Chronological Question Navigator Strip (1 - N) */}
          <div className="rounded-xl bg-obsidian-surface-card dark:bg-obsidian-surface-card bg-surface-container-low p-4 flex flex-col gap-3 shadow-xl border border-outline-variant/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-tertiary">grid_view</span>
                <h2 className="font-title-sm text-sm font-bold text-on-surface">Question Grid</h2>
              </div>
              <span className="font-mono-code text-xs text-on-surface-variant">
                Q1 – Q{totalItemCount}
              </span>
            </div>

            {/* Legend Pill Drawer */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 font-mono-code text-[11px] text-on-surface-variant">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-mastery-emerald inline-block" />
                <span>Correct</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-error inline-block" />
                <span>Incorrect</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                <span>Current</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-surface-container-high inline-block" />
                <span>Pending</span>
              </div>
            </div>

            {/* Compact Numerical Grid (8 columns) */}
            <div className="grid grid-cols-8 gap-1.5 max-h-[440px] overflow-y-auto pr-1">
              {Array.from({ length: totalItemCount }).map((_, idx) => {
                const qNum = idx + 1;
                const isCurrent = idx === currentIndex || qNum === questionNumber;
                const qObj = questions[idx];
                const qId = qObj?.id || String(qNum);
                const attStatus = combinedAnswerMap[qId];

                let pillClass =
                  'bg-surface-container-low text-on-surface-variant/60 hover:bg-surface-container border border-outline-variant/10';

                if (isCurrent) {
                  pillClass =
                    'bg-primary text-on-primary font-body-bold shadow-[0_0_12px_rgba(158,214,124,0.35)] scale-105 z-10';
                } else if (attStatus?.isCorrect === true) {
                  pillClass =
                    'bg-mastery-emerald/15 text-mastery-emerald hover:bg-mastery-emerald/25 border border-mastery-emerald/20';
                } else if (attStatus?.isCorrect === false) {
                  pillClass =
                    'bg-error/20 text-error hover:bg-error/30 border border-error/20';
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (onSelectIndex) {
                        onSelectIndex(idx);
                      }
                    }}
                    className={`h-8 rounded font-mono-code text-xs flex items-center justify-center transition-all cursor-pointer ${pillClass}`}
                    title={`Question ${qNum}`}
                  >
                    {String(qNum).padStart(2, '0')}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Analysis Callout Card */}
          <div className="rounded-xl bg-surface-container p-4 flex flex-col gap-2 border border-outline-variant/20 shadow-sm">
            <div className="flex items-center gap-1.5 font-label-caps text-xs text-tertiary uppercase">
              <span className="material-symbols-outlined text-[15px]">tips_and_updates</span>
              <span>PHILNITS Exam Tip</span>
            </div>
            <p className="font-body-base text-on-surface-variant text-xs leading-relaxed">
              For Morning Exam questions, allocate ~100 seconds per question. Calibrate your confidence rating honestly
              to optimize your personalized Spaced Repetition queue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

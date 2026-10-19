import React, { useState, useEffect, useRef } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ZoomableImage } from './ZoomableImage';
import { AnswerFeedback } from './AnswerFeedback';
import { ReportDialog } from './ReportDialog';
import type { QuestionData, SRScheduleRecord } from '../db/schema';
import { StatsDbService } from '../services/statsDb';
import { BOOKMARKS_KEY } from '../db';
import { useStore } from '../store/useStore';
import {
  choiceKeys,
  displayOrder,
  formatBlankPicks,
  isBlanksCorrect,
  isCorrectKey,
  isSelfGraded,
  parseBlankPicks,
  type BlankPicks,
} from '../services/choiceOrder';

/** One question's answer within a session; it survives navigating away and back */
export interface SessionAnswer {
  /** Original choice key ("c"), blank picks ("A=c, B=e"), or the self-graded pick */
  selected: string;
  isCorrect: boolean;
  timeSeconds: number;
  confidence?: number;
  choiceSwitches: number;
  /** The correct choice was picked at some point before the final answer */
  touchedCorrect: boolean;
}

export interface SubmittedAnswer extends SessionAnswer {
  questionId: string;
  topic: string;
}

/** Switching this many times before submitting shows the "commit to your reasoning" hint */
const FLIP_WARNING_AT = 3;

const letterAt = (i: number) => String.fromCharCode(97 + i);

interface QuestionCardProps {
  question: QuestionData;
  questionNumber: number;
  totalQuestions: number;
  /** Practice: grades and stores the attempt. Exam: records the pick without feedback. */
  onAnswerSubmitted: (answer: SubmittedAnswer) => Promise<{ schedule: SRScheduleRecord } | void>;
  onNextQuestion: () => void;
  onPreviousQuestion?: () => void;
  onSkipQuestion?: () => void;
  onDeferQuestion?: (questionId: string, topic: string) => void;
  hideAnswers?: boolean;
  hasNext: boolean;
  hasPrevious?: boolean;
  questions?: QuestionData[];
  currentIndex?: number;
  onSelectIndex?: (index: number) => void;
  /** Grid colors: past attempts merged with this session's answers */
  attemptStatusMap?: Record<string, { isCorrect: boolean }>;
  /** This session's answer to this question; the card opens in its submitted state */
  savedAnswer?: SessionAnswer | null;
  /** Shown after submitting when retries are allowed (one-attempt limit off) */
  onRetry?: () => void;
  /** Changes when the parent clears this question for a retry, so the card starts over */
  resetToken?: number;
  /** Stable choice shuffle for this session; null keeps the original order */
  shuffleSeed?: string | null;
  /** Session pause: freezes the timer and hides the question */
  paused?: boolean;
  /** Exam: no feedback, no going back, no defer; picks can be flagged */
  variant?: 'practice' | 'exam';
  flagged?: boolean;
  onToggleFlag?: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  questionNumber,
  totalQuestions,
  onAnswerSubmitted,
  onNextQuestion,
  onPreviousQuestion,
  onSkipQuestion,
  onDeferQuestion,
  hideAnswers,
  hasNext,
  hasPrevious = false,
  questions = [],
  currentIndex = 0,
  onSelectIndex,
  attemptStatusMap = {},
  savedAnswer = null,
  onRetry,
  resetToken = 0,
  shuffleSeed = null,
  paused = false,
  variant = 'practice',
  flagged = false,
  onToggleFlag,
}) => {
  const { confidenceTracking, requireConfidence, showTimer } = useStore();
  const setDrawKey = useStore((s) => s.setDrawKey);
  const isExam = variant === 'exam';

  // The global draw overlay keeps one in-memory sketch per visible question
  useEffect(() => {
    setDrawKey(question.id);
  }, [question.id, setDrawKey]);
  // Only leaving the question view hides the draw button; switching questions keeps draw mode on
  useEffect(() => () => setDrawKey(null), [setDrawKey]);

  const blanks = question.blanks ?? [];
  const hasBlanks = blanks.length > 0;
  const selfGraded = isSelfGraded(question);

  // Selection is always an ORIGINAL choice key; shuffling only changes what is shown
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [blankPicks, setBlankPicks] = useState<BlankPicks>({});
  const [choiceSwitches, setChoiceSwitches] = useState(0);
  const touchedCorrectRef = useRef(false);
  // No default: the student must pick how sure they are (null = not rated yet)
  const [confidence, setConfidence] = useState<number | null>(null);
  const [confidenceWarn, setConfidenceWarn] = useState(false);
  const confidenceRef = useRef<HTMLDivElement>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  // Self-graded cards: revealed, waiting for "I was right / wrong"
  const [awaitingSelfGrade, setAwaitingSelfGrade] = useState(false);
  const [schedule, setSchedule] = useState<SRScheduleRecord | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerStopped, setTimerStopped] = useState(false);
  // All bookmarked IDs, so the Question Grid can mark them too
  const [bookmarks, setBookmarks] = useState<string[]>(() => JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]'));
  const bookmarked = bookmarks.includes(question.id);
  const [reporting, setReporting] = useState(false);
  const [isDeferring, setIsDeferring] = useState<boolean>(false);

  // Timer: time banked from earlier running spans plus the current span (null while frozen)
  const bankedRef = useRef(0);
  const runningSinceRef = useRef<number | null>(Date.now());
  const readTimer = () => bankedRef.current + (runningSinceRef.current === null ? 0 : Date.now() - runningSinceRef.current) / 1000;
  const freezeTimer = () => {
    bankedRef.current = readTimer();
    runningSinceRef.current = null;
  };

  // Set when this card submits, so the answer echoing back from the parent doesn't reset the card
  const submittedForRef = useRef<string | null>(null);
  const retryRef = useRef(resetToken);

  // Load the question: a fresh card, or this session's earlier answer when coming back to it
  useEffect(() => {
    const saved = savedAnswer;
    if (saved && submittedForRef.current === question.id && retryRef.current === resetToken) return;
    submittedForRef.current = null;
    retryRef.current = resetToken;
    setSelectedChoice(saved && !hasBlanks ? saved.selected : null);
    setBlankPicks(saved && hasBlanks ? parseBlankPicks(saved.selected) : {});
    setChoiceSwitches(saved?.choiceSwitches ?? 0);
    touchedCorrectRef.current = saved?.touchedCorrect ?? false;
    setConfidence(saved?.confidence ?? null);
    setConfidenceWarn(false);
    setIsSubmitted(!!saved);
    setIsCorrect(saved?.isCorrect ?? false);
    setAwaitingSelfGrade(false);
    setSchedule(null);
    setTimerStopped(!!saved);
    bankedRef.current = saved?.timeSeconds ?? 0;
    runningSinceRef.current = saved || paused ? null : Date.now();
    setElapsedTime(bankedRef.current);

    // Re-read bookmarks (an import may have changed them)
    setBookmarks(JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]'));
    // Only a new question (or a retry clearing the answer) resets the card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, savedAnswer === null, resetToken]);

  // Session pause freezes this question's clock too
  useEffect(() => {
    if (isSubmitted || timerStopped) return;
    if (paused) freezeTimer();
    else if (runningSinceRef.current === null) runningSinceRef.current = Date.now();
    setElapsedTime(readTimer());
  }, [paused, isSubmitted, timerStopped]);

  useEffect(() => {
    if (isSubmitted || timerStopped || paused) return;
    const id = setInterval(() => setElapsedTime(readTimer()), 200);
    return () => clearInterval(id);
  }, [isSubmitted, timerStopped, paused, question.id]);

  const stopTimer = () => {
    freezeTimer();
    setElapsedTime(bankedRef.current);
    setTimerStopped(true);
  };

  const order = displayOrder(question, shuffleSeed);
  const displayLetterOf = (key: string) => (shuffleSeed ? letterAt(Math.max(0, order.indexOf(key))) : key);
  const correctKey = order.find((k) => isCorrectKey(question, k)) ?? null;

  const pick = (key: string) => {
    if (isSubmitted || paused) return;
    setSelectedChoice((prev) => {
      if (prev !== null && prev !== key) setChoiceSwitches((n) => n + 1);
      return key;
    });
    if (isCorrectKey(question, key)) touchedCorrectRef.current = true;
  };

  const pickBlank = (label: string, letter: string) => {
    if (isSubmitted || paused) return;
    setBlankPicks((prev) => {
      if (prev[label] && prev[label] !== letter) setChoiceSwitches((n) => n + 1);
      return { ...prev, [label]: letter };
    });
    if (blanks.find((b) => b.label === label)?.correct === letter) touchedCorrectRef.current = true;
  };

  const readyToSubmit = hasBlanks ? blanks.every((b) => blankPicks[b.label]) : !!selectedChoice;

  const finalize = async (correct: boolean, selected: string, finalTime: number) => {
    submittedForRef.current = question.id;
    setIsCorrect(correct);
    setIsSubmitted(true);
    setAwaitingSelfGrade(false);
    const result = await onAnswerSubmitted({
      questionId: question.id,
      topic: question.topics?.[0] || 'software',
      selected,
      isCorrect: correct,
      timeSeconds: finalTime,
      // Unrated answers keep the neutral 3 the attempt log has always used
      confidence: confidenceTracking ? confidence ?? 3 : 3,
      choiceSwitches,
      touchedCorrect: touchedCorrectRef.current || correct,
    });
    if (result && result.schedule) setSchedule(result.schedule);
  };

  // Handle choice submission
  const handleSubmit = async (skipConfidenceCheck = false) => {
    if (!readyToSubmit || isSubmitted || paused) return;

    // Remind before revealing the answer; the rating must be given blind to count for calibration
    if (!skipConfidenceCheck && confidenceTracking && requireConfidence && confidence === null) {
      setConfidenceWarn(true);
      // Short buzz on Android/installed PWAs; silently ignored where unsupported (iOS, desktop)
      try {
        navigator.vibrate?.(35);
      } catch {}
      confidenceRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      confidenceRef.current?.focus({ preventScroll: true });
      return;
    }

    freezeTimer();
    const finalTime = bankedRef.current;
    setElapsedTime(finalTime);
    setTimerStopped(true);

    if (hasBlanks) {
      await finalize(isBlanksCorrect(question, blankPicks), formatBlankPicks(question, blankPicks), finalTime);
    } else if (selfGraded && !isExam) {
      // The key is an image or free text: reveal it and let the student mark themselves
      setAwaitingSelfGrade(true);
    } else {
      await finalize(selectedChoice ? isCorrectKey(question, selectedChoice) : false, selectedChoice!, finalTime);
    }
  };

  const toggleBookmark = () => {
    const savedBookmarks: string[] = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
    const updated = savedBookmarks.includes(question.id)
      ? savedBookmarks.filter((id) => id !== question.id)
      : [...savedBookmarks, question.id];
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(updated));
    setBookmarks(updated);
  };

  // Keyboard shortcuts: letters and 1-9 pick the shown choice, Enter submits
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitted || paused || hasBlanks || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      const key = e.key.toLowerCase();
      const byLetter = key.length === 1 && key >= 'a' && key <= 'j' ? key.charCodeAt(0) - 97 : -1;
      const byNumber = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
      const idx = byLetter >= 0 ? byLetter : byNumber;
      if (idx >= 0 && idx < order.length) pick(order[idx]!);
      if (e.key === 'Enter' && selectedChoice) {
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

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
  const combinedAnswerMap = attemptStatusMap;

  // Calculate stats for right-hand ticker
  const answeredKeys = Object.keys(combinedAnswerMap);
  const correctCount = answeredKeys.filter((k) => combinedAnswerMap[k]?.isCorrect).length;
  const incorrectCount = answeredKeys.filter((k) => combinedAnswerMap[k] && !combinedAnswerMap[k]?.isCorrect).length;
  const pendingCount = Math.max(0, totalItemCount - correctCount - incorrectCount);
  const progressPercent = Math.min(100, Math.round((questionNumber / totalItemCount) * 100));

  // Exam answers stay hidden until the end; practice shows them once submitted
  const revealed = isSubmitted && !isExam;
  const showFlipWarning = !isSubmitted && choiceSwitches >= FLIP_WARNING_AT;

  // Shown letters follow the display order; the feedback names them the same way
  const shownCorrect = correctKey ? displayLetterOf(correctKey) : question.correct;
  const shownCorrectDisplay =
    shuffleSeed && correctKey ? `${shownCorrect}) ${question.options?.[correctKey] ?? ''}`.trim() : question.correct_display;
  const shownSelected = hasBlanks ? formatBlankPicks(question, blankPicks) : selectedChoice ? displayLetterOf(selectedChoice) : '';

  const choiceState = (key: string): 'idle' | 'selected' | 'correct' | 'wrong' | 'muted' => {
    const isSelected = selectedChoice === key;
    if (!revealed || selfGraded) return isSelected ? 'selected' : 'idle';
    if (isCorrectKey(question, key)) return 'correct';
    if (isSelected) return 'wrong';
    return 'muted';
  };

  const timerLabel = paused ? 'Paused' : timerStopped && !isSubmitted ? 'Stopped' : null;

  return (
    <div className="w-full flex flex-col gap-4">

      {/* Telemetry Bar & Context Rail */}
      <div className="w-full rounded-xl bg-surface-container-low border border-outline-variant/30 px-4 py-2.5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container font-mono-code text-xs text-on-surface-variant">
              <span className="w-1.5 h-1.5 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" />
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
            {(question.repeat_count ?? 1) >= 2 && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-confidence-amber/12 text-confidence-amber font-label-caps text-[10px] uppercase tracking-wider"
                title="This question, or a near copy, was asked in other exam years"
              >
                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">repeat</span>
                Appeared in {question.repeat_count} exams
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* Elapsed Timer, with stop: ends timing here and keeps the time so far */}
            {showTimer && !isExam && (
              <div className="flex items-center gap-1 rounded bg-surface-container font-mono-timer text-xs text-confidence-amber border border-outline-variant/20 whitespace-nowrap tabular-nums">
                <span className="flex items-center gap-1.5 pl-3 py-1">
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">timer</span>
                  <span>{formatTimer(elapsedTime)}</span>
                  {timerLabel && <span className="text-on-surface-variant">· {timerLabel}</span>}
                </span>
                {!isSubmitted && !timerStopped ? (
                  <button
                    type="button"
                    onClick={stopTimer}
                    aria-label="Stop the timer for this question"
                    title="Stop timing this question"
                    className="tap press-scale flex h-8 w-8 items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">stop_circle</span>
                  </button>
                ) : (
                  <span className="w-2" />
                )}
              </div>
            )}

            {/* Exam: flag to revisit in the report */}
            {isExam && onToggleFlag && (
              <button
                type="button"
                onClick={onToggleFlag}
                aria-pressed={flagged}
                aria-label={flagged ? 'Remove flag' : 'Flag this question'}
                title={flagged ? 'Remove flag' : 'Flag this question for the report'}
                className={`press-scale h-10 px-3 rounded border flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${
                  flagged
                    ? 'bg-confidence-amber/15 border-confidence-amber/40 text-confidence-amber'
                    : 'border-transparent bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true" style={flagged ? { fontVariationSettings: "'FILL' 1" } : {}}>
                  flag
                </span>
                <span className="hidden sm:inline">{flagged ? 'Flagged' : 'Flag'}</span>
              </button>
            )}

            {/* Report a problem with this question */}
            <button
              type="button"
              onClick={() => setReporting(true)}
              aria-label="Report a problem with this question"
              aria-haspopup="dialog"
              title="Report a problem with this question"
              className="press-scale w-10 h-10 rounded bg-surface-container hover:bg-surface-container-high transition-colors flex items-center justify-center cursor-pointer text-on-surface-variant hover:text-error"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">bug_report</span>
            </button>

            {/* Bookmark Trigger */}
            <button
              type="button"
              onClick={toggleBookmark}
              aria-label="Bookmark Question"
              aria-pressed={bookmarked}
              className={`press-scale w-10 h-10 rounded border transition-colors flex items-center justify-center cursor-pointer ${
                bookmarked
                  ? 'bookmark-on'
                  : 'border-transparent bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
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

      {reporting && <ReportDialog kind="question" questionId={question.id} onClose={() => setReporting(false)} />}

      {/* Primary Assessment Workspace Layout (2 Columns) */}
      <div className="w-full flex flex-col lg:flex-row gap-6 items-start">
        {/* Left Column: Core Focus Canvas (Stem, Schematic, Choices, Action Bar) (8 cols / 65%) */}
        <div className="w-full lg:w-8/12 flex flex-col gap-4">
          {/* Metadata Tag Strip & Paper Subheader */}
          <div className="flex flex-wrap items-center justify-end gap-2">
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
          <div className="relative w-full rounded-xl sm:rounded-2xl bg-surface-container-low dark:bg-obsidian-surface-card p-4 sm:p-6 flex flex-col gap-4 sm:gap-5 shadow-xl border border-outline-variant/20">
            {/* Paused: the question is hidden so pausing cannot be used to read ahead */}
            {paused && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-surface-container-low/80 backdrop-blur-xl text-center px-6">
                <span className="material-symbols-outlined text-4xl text-on-surface-variant" aria-hidden="true">pause_circle</span>
                <p className="font-headline-md text-lg font-bold text-on-surface">Paused</p>
                <p className="text-sm text-on-surface-variant">The question stays hidden until you resume.</p>
              </div>
            )}

            <div className={paused ? 'blur-md select-none pointer-events-none' : undefined} aria-hidden={paused || undefined}>
            {/* Question Stem Heading */}
            <div className="flex items-start gap-2.5 sm:gap-3">
              <span className="px-2.5 py-1 rounded-lg bg-surface-container-high text-primary font-mono-code text-xs font-body-bold shrink-0">
                Q{question.number || questionNumber}
              </span>
              <div className="font-body-stem text-base sm:text-[17px] text-on-surface leading-relaxed flex-1 break-words">
                {question.question && <MarkdownRenderer content={question.question} className="md-flow" />}
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

            <p className="sr-only" aria-live="polite">
              {revealed && !selfGraded
                ? isCorrect
                  ? 'Correct.'
                  : `Incorrect. The correct answer is ${String(shownCorrect).toUpperCase()}.`
                : ''}
            </p>

            {/* Multiple Choice Options Matrix */}
            <div className="flex flex-col gap-3 pt-4">
              <div className="flex items-center justify-between">
                <span id={`choices-${question.id}`} className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
                  {hasBlanks ? 'Fill each blank' : 'Select your answer'}
                </span>
                {!hasBlanks && (
                  <span className="font-mono-code text-on-surface-variant/70 text-xs hidden sm:inline">
                    Shortcut: Keys 1 to {Math.min(order.length, 9)} or A to {letterAt(order.length - 1).toUpperCase()}
                  </span>
                )}
              </div>

              {hasBlanks ? (
                <BlankRows
                  questionId={question.id}
                  blanks={blanks}
                  fallbackLetters={choiceKeys(question)}
                  picks={blankPicks}
                  revealed={revealed}
                  onPick={pickBlank}
                />
              ) : (
                /* Radio group: Tab lands on the group, arrows move between choices, Enter/Space picks */
                <div
                  role="radiogroup"
                  aria-labelledby={`choices-${question.id}`}
                  aria-disabled={isSubmitted || undefined}
                  className="flex flex-col gap-2.5"
                  onKeyDown={(e) => {
                    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                    const radios = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
                    const i = radios.indexOf(document.activeElement as HTMLElement);
                    if (i < 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
                    radios[(i + step + radios.length) % radios.length]?.focus();
                  }}
                >
                  {order.map((key, idx) => {
                    const optText = question.options?.[key] ?? '';
                    const state = choiceState(key);
                    const isSelected = selectedChoice === key;
                    const shown = shuffleSeed ? letterAt(idx) : key;
                    const stateLabel =
                      state === 'correct' ? (isSelected ? 'Your answer, correct' : 'Correct answer') : state === 'wrong' ? 'Your answer, incorrect' : undefined;

                    return (
                      <div
                        key={key}
                        role="radio"
                        aria-checked={isSelected}
                        aria-disabled={isSubmitted || undefined}
                        aria-label={stateLabel ? `${shown.toUpperCase()}. ${stateLabel}` : undefined}
                        aria-describedby={stateLabel ? `${question.id}-${key}-text` : undefined}
                        data-state={state}
                        tabIndex={isSelected || (!selectedChoice && idx === 0) ? 0 : -1}
                        onClick={() => pick(key)}
                        onKeyDown={(e) => {
                          if (e.key !== ' ' && e.key !== 'Enter') return;
                          // Space selects; Enter keeps its global "submit" meaning once something is selected
                          if (e.key === 'Enter' && isSelected) return;
                          e.preventDefault();
                          e.stopPropagation();
                          pick(key);
                        }}
                        className={`choice group relative flex items-center gap-3 sm:gap-3.5 p-3 sm:p-3.5 rounded-xl min-h-[48px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                          isSubmitted ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'
                        }`}
                      >
                        <div className="choice-key w-8 h-8 rounded flex items-center justify-center font-mono-code text-sm font-bold uppercase shrink-0">
                          {state === 'correct' ? (
                            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">check_circle</span>
                          ) : state === 'wrong' ? (
                            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">cancel</span>
                          ) : (
                            shown
                          )}
                        </div>

                        <div id={`${question.id}-${key}-text`} className="flex-1 min-w-0 font-mono-code text-sm break-words">
                          {optText ? (
                            <MarkdownRenderer content={optText} className="prose-p:my-0 text-sm" />
                          ) : (
                            <span>Option {shown.toUpperCase()}</span>
                          )}
                        </div>

                        {(state === 'correct' || state === 'wrong') && (
                          <span className="choice-tag inline-flex items-center px-2 py-0.5 rounded-full font-label-caps text-[10px] uppercase tracking-wider shrink-0" aria-hidden="true">
                            {state === 'correct' ? (isSelected ? 'Your answer' : 'Correct') : 'Your answer'}
                          </span>
                        )}
                        <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-surface-container font-mono-code text-[11px] text-on-surface-variant/60" aria-hidden="true">
                          [{idx + 1}]
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Flip warning: non-blocking nudge after several switches */}
              {showFlipWarning && (
                <p role="status" className="flex items-start gap-2 rounded-lg bg-interactive-sky/10 px-3 py-2.5 text-[13px] leading-relaxed text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-interactive-sky mt-px" aria-hidden="true">swap_horiz</span>
                  <span>Switching a lot? Commit to your reasoning first, that&rsquo;s what builds recall.</span>
                </p>
              )}

              {/* Self-graded: the key is an image or free text, so the student marks the attempt */}
              {awaitingSelfGrade && (
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 flex flex-col gap-3">
                  <p className="text-xs font-label-caps uppercase tracking-wider text-on-surface-variant">Official key</p>
                  <MarkdownRenderer content={question.correct_display || question.correct} className="text-sm" />
                  <p className="text-sm text-on-surface">This answer key can&rsquo;t be checked automatically. Did your pick match it?</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => finalize(true, selectedChoice || '', bankedRef.current)}
                      className="press-scale min-h-[44px] px-4 rounded-lg bg-success-container text-on-success-container border-2 border-success font-semibold text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>I was right
                    </button>
                    <button
                      type="button"
                      onClick={() => finalize(false, selectedChoice || '', bankedRef.current)}
                      className="press-scale min-h-[44px] px-4 rounded-lg bg-error-soft text-on-error-soft border-2 border-error font-semibold text-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">cancel</span>I was wrong
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Confidence Calibration Strip */}
            {confidenceTracking && !isSubmitted && !awaitingSelfGrade && (
              <div
                ref={confidenceRef}
                tabIndex={-1}
                className={`outline-none pt-4 flex flex-col gap-2 rounded-xl transition-shadow ${
                  confidenceWarn ? 'confidence-warn ring-2 ring-confidence-amber/60 ring-offset-2 sm:ring-offset-4 ring-offset-surface-container-low' : ''
                }`}
              >
                <div className="flex items-center justify-between text-on-surface-variant font-label-caps text-xs uppercase tracking-wider">
                  <span id={`confidence-${question.id}`}>How sure are you?</span>
                  <span className="text-confidence-amber flex items-center gap-1 font-mono-code">
                    <span className="material-symbols-outlined text-[14px]">grade</span>
                    {confidence === null
                      ? 'Not rated yet'
                      : `Level ${confidence}: ${confidenceLevels.find((l) => l.value === confidence)?.label}`}
                  </span>
                </div>

                <div role="group" aria-labelledby={`confidence-${question.id}`} className="grid grid-cols-5 gap-1 min-[400px]:gap-1.5 sm:gap-2">
                  {confidenceLevels.map((lvl) => {
                    const isSelected = confidence === lvl.value;
                    return (
                      <button
                        key={lvl.value}
                        type="button"
                        onClick={() => {
                          setConfidence(lvl.value);
                          setConfidenceWarn(false);
                        }}
                        aria-pressed={isSelected}
                        className={`min-h-[48px] py-2 px-0.5 min-[400px]:px-1 rounded-lg font-mono-code text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer touch-manipulation ${
                          isSelected
                            ? 'bg-confidence-amber/20 text-confidence-amber font-body-bold shadow-[0_0_12px_rgba(245,158,11,0.2)] border border-confidence-amber/40 ring-1 ring-confidence-amber/30'
                            : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/20'
                        }`}
                      >
                        <span className={`text-[10px] ${isSelected ? 'text-confidence-amber font-bold' : 'text-on-surface-variant/60'}`}>
                          {lvl.value}
                        </span>
                        <span className="max-w-full truncate text-[10px] tracking-tight min-[400px]:text-[11px] min-[400px]:tracking-normal">{lvl.label}</span>
                      </button>
                    );
                  })}
                </div>

                {confidenceWarn && (
                  <div
                    role="alert"
                    className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 rounded-lg bg-confidence-amber/12 px-3 py-3 sm:py-2.5 text-[13px] sm:text-xs leading-relaxed text-on-surface"
                  >
                    <span className="flex items-start gap-2 flex-1">
                      <span className="material-symbols-outlined text-[16px] text-confidence-amber mt-px" aria-hidden="true">
                        priority_high
                      </span>
                      <span>
                        <strong className="font-semibold">You haven&rsquo;t answered &ldquo;How sure are you?&rdquo;</strong> Pick a
                        level before submitting so your calibration stays accurate.
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSubmit(true)}
                      className="press-scale self-stretch sm:self-auto min-h-[44px] px-3 rounded-lg border border-confidence-amber/30 sm:border-transparent font-semibold text-confidence-amber hover:bg-confidence-amber/15 whitespace-nowrap cursor-pointer"
                    >
                      Submit without rating
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>

            {/* Navigation Action Footer */}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between pt-3 gap-2.5 sm:gap-3 border-t border-outline-variant/20">
              {!isExam ? (
                <button
                  type="button"
                  onClick={onPreviousQuestion}
                  disabled={!hasPrevious && currentIndex === 0}
                  className="px-3.5 sm:px-4 py-2.5 min-h-[44px] rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-bold text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  <span>Previous</span>
                </button>
              ) : (
                <span className="text-xs font-mono-code text-on-surface-variant">Answers lock when you move on</span>
              )}

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-auto">
                {onRetry && revealed && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="px-3.5 sm:px-4 py-2.5 min-h-[44px] rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-bold text-sm flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">replay</span>
                    <span>Try again</span>
                  </button>
                )}

                {onSkipQuestion && !isSubmitted && !awaitingSelfGrade && (
                  <button
                    type="button"
                    onClick={onSkipQuestion}
                    disabled={paused}
                    className="px-3.5 sm:px-4 py-2.5 min-h-[44px] rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-base text-sm transition-colors cursor-pointer border border-outline-variant/20 flex items-center justify-center disabled:opacity-40"
                  >
                    <span>Skip</span>
                  </button>
                )}

                {!isSubmitted && !isExam && !awaitingSelfGrade && (
                  <button
                    type="button"
                    disabled={paused}
                    onClick={async () => {
                      setIsDeferring(true);
                      const topic = question.topics?.[0] || 'software';
                      if (onDeferQuestion) {
                        onDeferQuestion(question.id, topic);
                      } else {
                        await StatsDbService.deferQuestion(
                          question.id,
                          topic,
                          'cant_answer_now',
                          question.session_id || question.year
                        );
                      }
                      setTimeout(() => {
                        setIsDeferring(false);
                        if (onSkipQuestion) {
                          onSkipQuestion();
                        } else if (onNextQuestion) {
                          onNextQuestion();
                        }
                      }, 400);
                    }}
                    className={`px-3.5 sm:px-4 py-2.5 min-h-[44px] rounded-lg font-body-base text-sm transition-all cursor-pointer border flex items-center justify-center gap-2 disabled:opacity-40 ${
                      isDeferring
                        ? 'bg-confidence-amber text-on-primary border-confidence-amber scale-95 shadow-inner'
                        : 'bg-confidence-amber/10 hover:bg-confidence-amber/20 text-confidence-amber border-confidence-amber/30 active:scale-95'
                    }`}
                    title="I can't answer this right now (Defer and revisit later)"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isDeferring ? 'check' : 'schedule_send'}
                    </span>
                    <span>{isDeferring ? 'Deferred' : 'Defer'}</span>
                  </button>
                )}

                {awaitingSelfGrade ? null : !isSubmitted ? (
                  <button
                    type="button"
                    onClick={() => handleSubmit()}
                    disabled={!readyToSubmit || paused}
                    className="px-5 py-2.5 min-h-[46px] rounded-lg bg-primary text-on-primary hover:bg-primary-fixed-dim font-body-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>{isExam ? (hasNext ? 'Save & Next' : 'Save & Finish') : 'Submit & Proceed'}</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                ) : (
                  !isExam && (
                    <button
                      type="button"
                      onClick={onNextQuestion}
                      className="px-5 py-2.5 min-h-[46px] rounded-lg bg-primary text-on-primary hover:bg-primary-fixed-dim font-body-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98] cursor-pointer"
                    >
                      <span>{hasNext ? 'Next Question' : 'Finish Quiz'}</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Feedback & Explanation Section */}
            {revealed && !selfGraded && (
              <AnswerFeedback
                isCorrect={isCorrect}
                selectedAnswer={shownSelected}
                correctAnswer={hasBlanks ? question.correct : String(shownCorrect)}
                correctDisplay={shownCorrectDisplay}
                explanation={question.explanation}
                schedule={schedule}
                timeSeconds={elapsedTime}
                confidence={confidenceTracking && confidence !== null ? confidence : undefined}
                onNext={onNextQuestion}
                hasNext={hasNext}
                hideExplanation={hideAnswers ?? false}
                questionTopics={question.topics}
                questionYear={question.year}
                questionId={question.id}
                questionText={question.question}
              />
            )}
            {revealed && selfGraded && question.explanation && (
              <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4">
                <MarkdownRenderer content={question.explanation} className="text-sm" />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chronological 80-Question Rail (4 cols / 35%) */}
        <div className="w-full lg:w-4/12 flex flex-col gap-4">
          {/* Session Telemetry Summary Card */}
          <div className="rounded-xl bg-surface-container-low dark:bg-obsidian-surface-card p-4 flex flex-col gap-3 shadow-xl border border-outline-variant/20">
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

            {/* Score & Precision Ticker Grid (hidden in exams: no feedback until the end) */}
            {!isExam && (
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
            )}
          </div>

          {/* Chronological Question Navigator Strip (1 - N) */}
          <div className="rounded-xl bg-surface-container-low dark:bg-obsidian-surface-card p-4 flex flex-col gap-3 shadow-xl border border-outline-variant/20">
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
              {!isExam && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-mastery-emerald inline-block" />
                    <span>Correct</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-error inline-block" />
                    <span>Incorrect</span>
                  </div>
                </>
              )}
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                <span>Current</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-surface-container-high inline-block" />
                <span>Pending</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="grid-bookmark" style={{ position: 'static', display: 'inline-block' }} aria-hidden="true" />
                <span>Bookmarked</span>
              </div>
            </div>

            {/* Compact Numerical Grid (8 columns); exams only move forward, so the grid is read-only there */}
            <div className="grid grid-cols-8 gap-1.5 max-h-[440px] overflow-y-auto pr-1">
              {Array.from({ length: totalItemCount }).map((_, idx) => {
                const qNum = idx + 1;
                const isCurrent = idx === currentIndex || qNum === questionNumber;
                const qObj = questions[idx];
                const qId = qObj?.id || String(qNum);
                const attStatus = combinedAnswerMap[qId];
                const isBookmarked = !!qObj && bookmarks.includes(qObj.id);

                let pillClass =
                  'bg-surface-container-low text-on-surface-variant/60 hover:bg-surface-container border border-outline-variant/10';

                if (isCurrent) {
                  pillClass =
                    'bg-primary text-on-primary font-body-bold shadow-[0_0_12px_rgba(158,214,124,0.35)] scale-105 z-10';
                } else if (isExam && attStatus) {
                  pillClass = 'bg-surface-container-highest text-on-surface border border-outline-variant/30';
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
                    disabled={isExam}
                    onClick={() => {
                      if (onSelectIndex) {
                        onSelectIndex(idx);
                      }
                    }}
                    className={`relative h-8 rounded font-mono-code text-xs flex items-center justify-center transition-all ${isExam ? 'cursor-default' : 'cursor-pointer'} ${pillClass}`}
                    title={`Question ${qNum}${isBookmarked ? ' • Bookmarked' : ''}`}
                    aria-label={`Question ${qNum}${isBookmarked ? ', bookmarked' : ''}`}
                  >
                    {String(qNum).padStart(2, '0')}
                    {isBookmarked && <span className="grid-bookmark" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

/** Subject B / PM blanks: one row of letters per blank (the choices themselves are in the image) */
const BlankRows: React.FC<{
  questionId: string;
  blanks: Array<{ label: string; correct: string; choices?: string[] }>;
  /** Used for a blank whose exact answer group is not mapped yet */
  fallbackLetters: string[];
  picks: BlankPicks;
  revealed: boolean;
  onPick: (label: string, letter: string) => void;
}> = ({ questionId, blanks, fallbackLetters, picks, revealed, onPick }) => (
  <div className="flex flex-col gap-2.5">
    {blanks.map((b) => {
      const pickLetter = picks[b.label];
      const rowCorrect = revealed && pickLetter === b.correct;
      const labelId = `${questionId}-blank-${b.label}`;
      return (
        <div key={b.label} className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span id={labelId} className="flex items-center gap-1.5 w-28 shrink-0 font-mono-code text-xs font-semibold text-on-surface">
            {revealed && (
              <span
                className={`material-symbols-outlined text-[16px] ${rowCorrect ? 'text-success' : 'text-error'}`}
                aria-label={rowCorrect ? 'Correct' : 'Incorrect'}
              >
                {rowCorrect ? 'check_circle' : 'cancel'}
              </span>
            )}
            Blank {b.label}
          </span>
          <div role="radiogroup" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
            {(b.choices ?? fallbackLetters).map((letter) => {
              const selected = pickLetter === letter;
              const state = !revealed
                ? selected
                  ? 'selected'
                  : 'idle'
                : letter === b.correct
                ? 'correct'
                : selected
                ? 'wrong'
                : 'muted';
              return (
                <button
                  key={letter}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Blank ${b.label}: ${letter.toUpperCase()}${state === 'correct' ? ', correct answer' : state === 'wrong' ? ', your answer, incorrect' : ''}`}
                  disabled={revealed}
                  data-state={state}
                  onClick={() => onPick(b.label, letter)}
                  className="choice press-scale h-11 w-11 rounded-lg font-mono-code text-sm font-bold uppercase flex items-center justify-center cursor-pointer disabled:cursor-default"
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

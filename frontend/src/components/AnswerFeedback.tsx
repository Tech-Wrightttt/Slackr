import React, { useEffect, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { SRScheduleRecord } from '../db/schema';
import {
  LearningResourcesService,
  type LearningResource,
} from '../services/learningResourcesService';
import {
  AnalyticalBreakdownService,
  type AnalyticalStep,
} from '../services/analyticalBreakdownService';

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
  questionTopics?: string[];
  questionYear?: string;
  questionId?: string;
  questionText?: string;
  hideExplanation?: boolean;
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
  questionTopics = [],
  questionYear,
  questionId,
  questionText,
  hideExplanation = false,
}) => {
  const [isRevealed, setIsRevealed] = useState(!hideExplanation);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [copied, setCopied] = useState(false);

  // Breakdown View Mode: default to original derivation when user gets a wrong answer, steps when correct
  const [breakdownView, setBreakdownView] = useState<'steps' | 'original'>(
    isCorrect ? 'steps' : 'original'
  );
  const [showOriginalDrawer, setShowOriginalDrawer] = useState(false);

  // Sync default view when question or correctness changes
  useEffect(() => {
    setBreakdownView(isCorrect ? 'steps' : 'original');
  }, [isCorrect, questionId]);

  // Analytical Steps State
  const [steps, setSteps] = useState<AnalyticalStep[]>([]);
  const [isEditingSteps, setIsEditingSteps] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [stepSaveStatus, setStepSaveStatus] = useState<string | null>(null);

  // Editable Learning Resources state
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [editingResource, setEditingResource] = useState<LearningResource | 'new' | null>(null);
  const [formResLabel, setFormResLabel] = useState('');
  const [formResUrl, setFormResUrl] = useState('');
  const [formResTargetType, setFormResTargetType] = useState<'topic' | 'question'>('topic');
  const [formResTargetKey, setFormResTargetKey] = useState('');
  const [resourceSaveStatus, setResourceSaveStatus] = useState<string | null>(null);

  // Load analytical steps for this question
  useEffect(() => {
    let isMounted = true;
    const fetchSteps = async () => {
      try {
        const loadedSteps = await AnalyticalBreakdownService.getStepsForQuestion({
          questionId,
          topics: questionTopics,
          explanation,
          correctDisplay,
          selectedAnswer,
          questionText,
        });
        if (isMounted) {
          setSteps(loadedSteps);
        }
      } catch (err) {
        console.error('Failed to load analytical breakdown steps:', err);
      }
    };
    fetchSteps();
    return () => {
      isMounted = false;
    };
  }, [questionId, questionTopics, explanation, correctDisplay, selectedAnswer, questionText]);

  // Load resources for this question & topics
  useEffect(() => {
    let isMounted = true;
    const fetchResources = async () => {
      try {
        const loaded = await LearningResourcesService.getResources(questionId, questionTopics);
        if (isMounted) {
          setResources(loaded);
        }
      } catch (err) {
        console.error('Failed to load learning resources:', err);
      }
    };
    fetchResources();
    return () => {
      isMounted = false;
    };
  }, [questionId, questionTopics]);

  // Keyboard shortcut (Space / Enter) to advance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') {
        return;
      }
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

  // Step editing handlers
  const handleStepChange = (index: number, field: keyof AnalyticalStep, value: any) => {
    setSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddStep = () => {
    const nextNum = (steps.length + 1).toString().padStart(2, '0');
    const newStep: AnalyticalStep = {
      id: `step-${Date.now()}`,
      stepNumber: nextNum,
      title: 'New Analytical Step',
      content: 'Enter derivation details here...',
      type: 'standard',
    };
    setSteps((prev) => [...prev, newStep]);
    setEditingStepIndex(steps.length);
  };

  const handleDeleteStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
    setEditingStepIndex(null);
  };

  const handleSaveAllSteps = async () => {
    if (!questionId) return;
    try {
      await AnalyticalBreakdownService.saveStepsForQuestion(questionId, steps);
      setIsEditingSteps(false);
      setEditingStepIndex(null);
      setStepSaveStatus('Saved to analytical_breakdowns.json');
      setTimeout(() => setStepSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to save breakdown steps:', err);
    }
  };

  // Learning resource handlers
  const handleOpenAddResourceForm = () => {
    setFormResLabel('');
    setFormResUrl('');
    const defaultTopic = questionTopics[0] || 'general';
    setFormResTargetType('topic');
    setFormResTargetKey(defaultTopic);
    setEditingResource('new');
  };

  const handleOpenEditResourceForm = (item: LearningResource, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setFormResLabel(item.label);
    setFormResUrl(item.url);
    setFormResTargetType(item.targetType || 'topic');
    setFormResTargetKey(item.targetKey || questionTopics[0] || 'general');
    setEditingResource(item);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formResLabel.trim() || !formResUrl.trim()) return;

    try {
      if (editingResource === 'new') {
        await LearningResourcesService.addResource({
          label: formResLabel.trim(),
          url: formResUrl.trim(),
          targetType: formResTargetType,
          targetKey: formResTargetType === 'question' ? (questionId || 'current') : formResTargetKey,
        });
        setResourceSaveStatus('Saved to learning_resources.json');
      } else if (editingResource && typeof editingResource === 'object') {
        await LearningResourcesService.updateResource(editingResource.id, {
          label: formResLabel.trim(),
          url: formResUrl.trim(),
        });
        setResourceSaveStatus('Updated in learning_resources.json');
      }

      const refreshed = await LearningResourcesService.getResources(questionId, questionTopics);
      setResources(refreshed);
      setEditingResource(null);
      setTimeout(() => setResourceSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to save learning resource:', err);
    }
  };

  const handleDeleteResource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Remove this resource link from the JSON database?')) return;

    try {
      await LearningResourcesService.deleteResource(id);
      const refreshed = await LearningResourcesService.getResources(questionId, questionTopics);
      setResources(refreshed);
      setResourceSaveStatus('Removed from learning_resources.json');
      setTimeout(() => setResourceSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to delete learning resource:', err);
    }
  };

  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const topicName = questionTopics?.[0]
    ? questionTopics[0].replace(/-/g, ' ').toUpperCase()
    : 'GENERAL SYLLABUS';

  return (
    <div className="mt-6 sm:mt-8 rounded-2xl sm:rounded-3xl border border-outline-variant/30 bg-surface-container-low p-3.5 sm:p-6 lg:p-10 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200 flex flex-col gap-6 sm:gap-8">
      {/* Post-Evaluation Result Banner */}
      <div className="bg-surface-container rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 shadow-sm">
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center border shrink-0 shadow-sm ${
              isCorrect
                ? 'bg-mastery-emerald/15 text-mastery-emerald border-mastery-emerald/30'
                : 'bg-error/15 text-error border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-2xl sm:text-3xl">
              {isCorrect ? 'check_circle' : 'cancel'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${isCorrect ? 'text-mastery-emerald' : 'text-error'}`}>
                {isCorrect ? 'Correct Answer Verified' : 'Incorrect Choice'}
              </h3>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wide border ${
                  isCorrect
                    ? 'bg-mastery-emerald/20 text-mastery-emerald border-mastery-emerald/30'
                    : 'bg-error/20 text-error border-error/30'
                }`}
              >
                {isCorrect ? 'Passed (+1.25 pts)' : 'Review Required'}
              </span>
            </div>
            <p className="text-xs sm:text-sm font-mono-code text-on-surface-variant mt-1 break-words">
              Your answer: <span className={`font-bold ${isCorrect ? 'text-mastery-emerald' : 'text-error'}`}>{selectedAnswer || 'None'}</span>
              <span className="mx-2 text-on-surface-variant/40">•</span>
              Official key: <span className="font-bold text-primary">{correctDisplay || correctAnswer.toUpperCase()}</span>
            </p>
          </div>
        </div>

        {/* Stats and Proceed Button */}
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2.5 sm:gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant/30 text-xs font-mono-code text-on-surface shadow-xs">
              <span className="material-symbols-outlined text-[15px] text-primary">timer</span>
              <span className="font-bold">{timeSeconds.toFixed(1)}s</span>
            </div>
            {confidence !== undefined && (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant/30 text-xs font-mono-code text-confidence-amber shadow-xs">
                <span className="material-symbols-outlined text-[15px]">grade</span>
                <span className="font-bold">Lvl {confidence}</span>
              </div>
            )}
          </div>
          <button
            onClick={onNext}
            className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-bold text-sm shadow-md transition-transform active:scale-95 cursor-pointer"
            type="button"
          >
            <span>{hasNext ? 'Proceed to Next' : 'Complete Session'}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Leitner Spaced Repetition Notification Pill */}
      {schedule && (
        <div className="bg-surface-container/70 rounded-xl sm:rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 border border-outline-variant/20 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs font-mono-code text-on-surface-variant gap-2">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">sync</span>
            <span className="leading-relaxed">
              <strong className="text-on-surface">Leitner Calibrated:</strong> Review on{' '}
              <strong className="text-on-surface">{new Date(schedule.nextReviewDate).toLocaleDateString()}</strong> (SRS interval: <strong>{schedule.intervalDays}d</strong>)
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-md bg-surface-container-high text-on-surface font-semibold uppercase text-[10px] border border-outline-variant/20 shrink-0">
            Box {schedule.repetitionNumber || 1} Tracking
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Official Analytical Breakdown Header & Dual-View Switcher                 */}
      {/* ========================================================================= */}
      <section className="bg-surface-container/50 rounded-2xl sm:rounded-3xl border border-outline-variant/30 p-4 sm:p-6 lg:p-10 space-y-6 sm:space-y-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/20 pb-5 sm:pb-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-primary/10 text-primary border border-primary/30 flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-xl sm:text-2xl">school</span>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
                Official Analytical Breakdown
              </h2>
              <p className="text-[11px] sm:text-xs font-mono-code text-on-surface-variant mt-0.5">
                IPA Syllabus Criteria • Step-by-Step Problem Derivation
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
            {/* View Mode Segmented Switcher (Preserves Original!) */}
            <div className="w-full sm:w-auto grid grid-cols-2 sm:flex p-1 rounded-xl bg-surface-container border border-outline-variant/30 gap-1 font-mono-code text-xs">
              <button
                type="button"
                onClick={() => setBreakdownView('steps')}
                className={`py-2 sm:py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all min-h-[40px] sm:min-h-0 ${
                  breakdownView === 'steps'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">format_list_numbered</span>
                <span>Step Breakdown</span>
              </button>
              <button
                type="button"
                onClick={() => setBreakdownView('original')}
                className={`py-2 sm:py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all min-h-[40px] sm:min-h-0 ${
                  breakdownView === 'original'
                    ? 'bg-primary text-on-primary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">article</span>
                <span>Original Derivation</span>
              </button>
            </div>

            {/* Topic Category Pill */}
            <span className="px-3 py-1.5 rounded-xl bg-secondary-container/30 text-on-surface border border-outline-variant/30 font-mono-code text-[11px] sm:text-xs font-bold uppercase tracking-wider w-fit self-start sm:self-auto">
              {topicName}
            </span>
          </div>
        </div>

        {/* Hidden Self-Assessment View */}
        {!isRevealed ? (
          <div className="rounded-2xl bg-surface-container/60 p-8 sm:p-10 border border-outline-variant/30 flex flex-col items-center justify-center gap-4 text-center">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/50">visibility_off</span>
            <div className="max-w-md">
              <p className="text-base font-semibold text-on-surface">
                Explanation is hidden for self-assessment
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                Attempt to verify your reasoning before uncovering the full derivation and solution key.
              </p>
            </div>
            <button
              onClick={() => setIsRevealed(true)}
              className="mt-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary-fixed-dim transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              <span>Reveal Detailed Breakdown</span>
            </button>
          </div>
        ) : (
          <>
            {/* =================================================================== */}
            {/* VIEW 1: STEP BREAKDOWN (User Template Design with Editable Numbers) */}
            {/* =================================================================== */}
            {breakdownView === 'steps' && (
              <div className="space-y-8 text-on-surface">
                {/* Edit Controls Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/10 text-xs font-mono-code">
                  <div className="flex items-center gap-2">
                    <span className="text-on-surface-variant">Step Telemetry</span>
                    <span className="text-outline-variant">•</span>
                    <span className="text-primary font-semibold">{steps.length} Sequenced Phases</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {stepSaveStatus && (
                      <span className="flex items-center gap-1 text-mastery-emerald font-semibold animate-in fade-in mr-2">
                        <span className="material-symbols-outlined text-[15px]">check_circle</span>
                        <span>{stepSaveStatus}</span>
                      </span>
                    )}

                    {!isEditingSteps ? (
                      <button
                        type="button"
                        onClick={() => setIsEditingSteps(true)}
                        className="px-3.5 py-2 min-h-[38px] rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-primary font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full sm:w-auto"
                      >
                        <span className="material-symbols-outlined text-[15px]">edit</span>
                        <span>Edit Breakdown Steps</span>
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handleAddStep}
                          className="px-3 py-2 min-h-[38px] rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-on-surface font-semibold flex items-center gap-1 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[15px]">add</span>
                          <span>Add Step</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingSteps(false);
                            setEditingStepIndex(null);
                          }}
                          className="px-3 py-2 min-h-[38px] rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveAllSteps}
                          className="px-4 py-2 min-h-[38px] rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">save</span>
                          <span>Save to JSON</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Steps List */}
                <div className="space-y-6 sm:space-y-8">
                  {steps.map((step, idx) => {
                    const isTrap = step.type === 'trap';
                    const isConclusion = step.type === 'conclusion';
                    const isBeingEdited = isEditingSteps && editingStepIndex === idx;

                    return (
                      <div key={step.id || idx} className="space-y-3 group/step">
                        {/* Step Header with Editable Number and Title */}
                        <div className="flex items-start sm:items-center justify-between gap-2.5 sm:gap-3">
                          <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0">
                            {/* Editable Number Badge */}
                            {isEditingSteps ? (
                              <input
                                type="text"
                                value={step.stepNumber}
                                onChange={(e) => handleStepChange(idx, 'stepNumber', e.target.value)}
                                className={`w-10 h-8 rounded-lg font-mono font-bold text-xs text-center border focus:outline-none shrink-0 ${
                                  isTrap
                                    ? 'bg-error text-white border-error'
                                    : 'bg-primary text-on-primary border-primary'
                                }`}
                                title="Click to edit step number"
                              />
                            ) : (
                              <span
                                className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs shrink-0 shadow-xs ${
                                  isTrap ? 'bg-error text-white' : 'bg-primary text-on-primary'
                                }`}
                              >
                                {step.stepNumber}
                              </span>
                            )}

                            {/* Editable Step Title */}
                            {isEditingSteps ? (
                              <input
                                type="text"
                                value={step.title}
                                onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-sm sm:text-base font-bold text-on-surface focus:outline-none focus:border-primary"
                              />
                            ) : (
                              <h4
                                className={`text-sm sm:text-base font-bold tracking-tight break-words ${
                                  isTrap ? 'text-error' : 'text-on-surface'
                                }`}
                              >
                                {step.title}
                              </h4>
                            )}
                          </div>

                          {/* Quick Step Actions when editing */}
                          {isEditingSteps && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <select
                                value={step.type || 'standard'}
                                onChange={(e) => handleStepChange(idx, 'type', e.target.value)}
                                className="px-2 py-1.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs font-mono-code text-on-surface focus:outline-none min-h-[36px]"
                              >
                                <option value="standard">Standard Step</option>
                                <option value="parameter">Parameter Grid</option>
                                <option value="formula">Formula Display</option>
                                <option value="conclusion">Conclusion Box</option>
                                <option value="trap">Trap Analysis</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteStep(idx)}
                                title="Delete this step"
                                className="p-1.5 rounded-lg text-error hover:bg-error/15 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Step Content / Specialized Card Body (pl-0 on mobile for maximum space, pl-11 on desktop) */}
                        <div className="pl-0 sm:pl-11 pt-1 sm:pt-0">
                          {isEditingSteps ? (
                            <textarea
                              rows={3}
                              value={step.content}
                              onChange={(e) => handleStepChange(idx, 'content', e.target.value)}
                              className="w-full rounded-xl bg-surface-container border border-outline-variant/30 p-3 text-sm font-body-base text-on-surface focus:outline-none focus:border-primary resize-y"
                            />
                          ) : (
                            <>
                              {/* 1. Conclusion Special Frame */}
                              {isConclusion ? (
                                <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-primary/10 border border-primary/25 flex items-start gap-3 sm:gap-4 text-on-surface shadow-xs">
                                  <span className="material-symbols-outlined text-xl sm:text-2xl text-primary shrink-0 mt-0.5">
                                    check_circle
                                  </span>
                                  <p className="text-xs sm:text-sm lg:text-base leading-relaxed">
                                    {step.content}
                                  </p>
                                </div>
                              ) : isTrap ? (
                                /* 2. Trap Analysis Special Frame */
                                <div className="p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-error/10 border border-error/25 text-on-surface space-y-2.5 shadow-xs">
                                  <p className="text-xs sm:text-sm lg:text-base leading-relaxed">
                                    {step.content}
                                  </p>
                                </div>
                              ) : step.type === 'parameter' && step.parameters && step.parameters.length > 0 ? (
                                /* 3. Parameter Visual Cards Grid (2-col on mobile phones, 4-col on desktop) */
                                <div className="space-y-3">
                                  <p className="text-xs sm:text-sm lg:text-base leading-relaxed text-on-surface-variant">
                                    {step.content}
                                  </p>
                                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                                    {step.parameters.map((p, pIdx) => (
                                      <div
                                        key={pIdx}
                                        className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-surface-container border border-outline-variant/20 space-y-1 shadow-xs"
                                      >
                                        <div className="text-[10px] sm:text-[11px] font-mono-code text-on-surface-variant uppercase tracking-wider font-medium truncate">
                                          {p.label}
                                        </div>
                                        <div className="text-xl sm:text-2xl font-mono font-extrabold text-on-surface truncate">
                                          {p.value}
                                        </div>
                                        {p.subtext && (
                                          <div className="text-[10px] sm:text-[11px] text-on-surface-variant/80 font-mono-code truncate">
                                            {p.subtext}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : step.type === 'formula' && step.formula ? (
                                /* 4. Mathematical Formula Display Box */
                                <div className="space-y-3">
                                  <p className="text-xs sm:text-sm lg:text-base leading-relaxed text-on-surface-variant">
                                    {step.content}
                                  </p>
                                  <div className="bg-surface-container rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-outline-variant/20 text-center space-y-3 sm:space-y-4 shadow-xs overflow-x-auto max-w-full styled-horizontal-scrollbar">
                                    <div className="inline-flex items-center gap-2 sm:gap-3 text-sm sm:text-base lg:text-lg font-mono text-on-surface flex-wrap justify-center font-bold">
                                      <span className="text-primary">{step.formula.label}</span>
                                      <span className="text-on-surface-variant font-normal">:</span>
                                      <span className="break-words">{step.formula.expression}</span>
                                    </div>
                                    {step.formula.result && (
                                      <div className="inline-flex items-center gap-2 sm:gap-3 text-base sm:text-lg lg:text-xl font-mono text-on-surface flex-wrap justify-center font-semibold pt-2 border-t border-outline-variant/20">
                                        <span className="text-primary font-extrabold">=</span>
                                        <span className="px-3 sm:px-4 py-1.5 bg-primary/20 text-primary rounded-xl border border-primary/30 font-extrabold">
                                          {step.formula.result}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                /* 5. Standard Content Paragraph */
                                <p className="text-xs sm:text-sm lg:text-base leading-relaxed text-on-surface">
                                  {step.content}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Quick Collapsible Drawer for Original Text Notes */}
                <div className="pt-4 border-t border-outline-variant/15 flex items-center justify-between text-xs font-mono-code text-on-surface-variant">
                  <button
                    type="button"
                    onClick={() => setShowOriginalDrawer(!showOriginalDrawer)}
                    className="hover:text-primary transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {showOriginalDrawer ? 'expand_less' : 'expand_more'}
                    </span>
                    <span>{showOriginalDrawer ? 'Hide Original Handbook Text' : 'View Original Source Handbook Derivation'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBreakdownView('original')}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    <span>Open in Full Original Mode</span>
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </button>
                </div>

                {showOriginalDrawer && (
                  <div className="rounded-2xl bg-surface-container p-6 border border-outline-variant/30 text-sm leading-relaxed text-on-surface animate-in fade-in duration-150">
                    <MarkdownRenderer
                      content={explanation || 'No handbook source text available.'}
                      className="prose-p:my-2 prose-headings:my-3"
                    />
                  </div>
                )}
              </div>
            )}

            {/* =================================================================== */}
            {/* VIEW 2: ORIGINAL DESIGN (Preserved completely as requested!)        */}
            {/* =================================================================== */}
            {breakdownView === 'original' && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-outline-variant/10 text-xs font-mono-code text-on-surface-variant">
                  <span>Canonical Source Derivation View (Unmodified Original)</span>
                  <button
                    type="button"
                    onClick={() => setBreakdownView('steps')}
                    className="text-primary hover:underline flex items-center gap-1 font-semibold min-h-[36px] sm:min-h-0 w-fit"
                  >
                    <span>Switch to Numbered Step Breakdown</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </button>
                </div>

                <div className="rounded-xl sm:rounded-2xl bg-surface-container/80 p-4 sm:p-8 border border-outline-variant/30 text-sm sm:text-base lg:text-[17px] leading-relaxed sm:leading-loose text-on-surface font-body-base shadow-md overflow-x-auto styled-horizontal-scrollbar">
                  {explanation ? (
                    <MarkdownRenderer
                      content={explanation}
                      className="prose-p:my-2.5 sm:prose-p:my-3 prose-p:leading-relaxed prose-headings:my-4 sm:prose-headings:my-5 prose-headings:font-bold prose-ul:my-2.5 sm:prose-ul:my-3 prose-li:my-1 sm:prose-li:my-1.5 prose-code:px-1.5 prose-code:py-0.5 text-sm sm:text-base lg:text-[17px] text-on-surface"
                    />
                  ) : (
                    <p className="italic text-on-surface-variant text-xs sm:text-sm font-mono-code">
                      Official key verified. Detailed step-by-step derivation available in curriculum handbook.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ========================================================================= */}
      {/* Related Learning Resources Section (Editable & Saved to JSON)            */}
      {/* ========================================================================= */}
      <section className="bg-surface-container/50 rounded-2xl sm:rounded-3xl border border-outline-variant/30 p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 shadow-sm">
        {/* AI Step-by-Step Prompt Button */}
        <button
          onClick={() => setShowAIPrompt(!showAIPrompt)}
          className="w-full min-h-[48px] py-3.5 px-4 sm:px-6 rounded-xl sm:rounded-2xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 text-primary font-bold text-xs sm:text-sm md:text-base flex items-center justify-center gap-2.5 sm:gap-3 transition-colors cursor-pointer group"
          type="button"
        >
          <span className="material-symbols-outlined text-xl sm:text-2xl group-hover:scale-110 transition-transform">
            smart_toy
          </span>
          <span className="text-center">{showAIPrompt ? 'Close AI Assistant' : 'Get AI Step-by-Step Explanation & Interactive Drill'}</span>
        </button>

        {showAIPrompt && (
          <div className="rounded-xl sm:rounded-2xl border border-outline-variant/30 bg-surface-container-high p-4 sm:p-6 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-mono uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5 font-bold">
                <span className="material-symbols-outlined text-[16px] text-primary">prompt_suggestion</span>
                AI Clarification Prompt
              </span>
              <button
                onClick={() => {
                  const promptText = `Please provide a clear, intuitive, and step-by-step educational explanation for this PHILNITS exam question.\n\nExam Details:\n- Year / Session: ${questionYear || 'PHILNITS Exam'}\n- Syllabus Domain: ${questionTopics?.join(', ') || 'Computer Systems / Software'}\n- Official Verified Answer: ${correctDisplay || correctAnswer}\n\nOfficial Solution / Current Explanation:\n${explanation || 'No step derivation given.'}\n\nTask:\n1. Break down why the correct option is right in simple terms.\n2. Explain why the other choices are incorrect.\n3. Provide a quick mnemonic or memory tip for this concept.`;
                  navigator.clipboard.writeText(promptText);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[38px] rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                  copied
                    ? 'bg-mastery-emerald text-white border-mastery-emerald'
                    : 'bg-surface-container border-outline-variant/30 text-on-surface hover:bg-surface-container-highest'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copied ? 'check' : 'content_copy'}
                </span>
                <span>{copied ? 'Copied!' : 'Copy Prompt'}</span>
              </button>
            </div>
            <textarea
              readOnly
              className="w-full h-28 rounded-xl bg-surface-container border border-outline-variant/20 p-3 sm:p-3.5 text-xs font-mono-code text-on-surface resize-none focus:outline-none"
              value={`Please provide a clear, intuitive, and step-by-step educational explanation for this PHILNITS exam question.\n\nExam Details:\n- Year / Session: ${questionYear || 'PHILNITS Exam'}\n- Syllabus Domain: ${questionTopics?.join(', ') || 'Computer Systems / Software'}\n- Official Verified Answer: ${correctDisplay || correctAnswer}\n\nOfficial Solution / Current Explanation:\n${explanation || 'No step derivation given.'}\n\nTask:\n1. Break down why the correct option is right in simple terms.\n2. Explain why the other choices are incorrect.\n3. Provide a quick mnemonic or memory tip for this concept.`}
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-outline-variant/15 text-xs">
              <span className="text-[11px] sm:text-xs text-on-surface-variant">Launch prompt directly in:</span>
              <div className="grid grid-cols-3 sm:flex items-center gap-2 font-mono-code">
                <a
                  href="https://chatgpt.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 sm:px-3 py-2 min-h-[40px] rounded-lg bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 text-xs text-on-surface flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <span className="material-symbols-outlined text-[14px] text-mastery-emerald">chat</span>
                  <span>ChatGPT</span>
                </a>
                <a
                  href="https://claude.ai/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 sm:px-3 py-2 min-h-[40px] rounded-lg bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 text-xs text-on-surface flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <span className="material-symbols-outlined text-[14px] text-confidence-amber">psychology</span>
                  <span>Claude</span>
                </a>
                <a
                  href="https://gemini.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 sm:px-3 py-2 min-h-[40px] rounded-lg bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 text-xs text-on-surface flex items-center justify-center gap-1.5 transition-colors text-center"
                >
                  <span className="material-symbols-outlined text-[14px] text-primary">auto_awesome</span>
                  <span>Gemini</span>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Resources Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pt-1 sm:pt-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-error/10 text-error border border-error/25 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-2xl">smart_display</span>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-on-surface">Related Learning Resources</h3>
              <p className="text-[11px] sm:text-xs font-mono-code text-on-surface-variant">
                Editable study links &amp; tutorials • Saved in JSON
              </p>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
            {resourceSaveStatus && (
              <span className="flex items-center gap-1 text-mastery-emerald font-mono-code text-xs font-semibold animate-in fade-in mr-1">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                <span>{resourceSaveStatus}</span>
              </span>
            )}
            <button
              onClick={handleOpenAddResourceForm}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary font-semibold text-xs transition shadow-xs cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">add_link</span>
              <span>Add Resource Link</span>
            </button>
          </div>
        </div>

        {/* Add / Edit Resource Form Inline */}
        {editingResource && (
          <form
            onSubmit={handleSaveResource}
            className="rounded-xl sm:rounded-2xl border border-primary/40 bg-surface-container-high p-4 sm:p-5 flex flex-col gap-4 animate-in fade-in duration-150"
          >
            <div className="flex items-center justify-between pb-1 border-b border-outline-variant/20">
              <span className="font-semibold text-sm text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  {editingResource === 'new' ? 'add_circle' : 'edit'}
                </span>
                {editingResource === 'new' ? 'Add Learning Resource' : 'Edit Learning Resource'}
              </span>
              <span className="text-[11px] font-mono-code text-primary">Saves to JSON</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">Resource Title / Label</label>
                <input
                  type="text"
                  required
                  value={formResLabel}
                  onChange={(e) => setFormResLabel(e.target.value)}
                  placeholder="e.g. Financial Statement & Break-Even Tutorial"
                  className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface-variant">URL or Search Query</label>
                <input
                  type="text"
                  required
                  value={formResUrl}
                  onChange={(e) => setFormResUrl(e.target.value)}
                  placeholder="e.g. https://www.youtube.com/... or https://..."
                  className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-surface-container border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {editingResource === 'new' && (
              <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                <span className="text-on-surface-variant font-medium">Link Scope:</span>
                <label className="flex items-center gap-1.5 cursor-pointer min-h-[36px]">
                  <input
                    type="radio"
                    name="targetType"
                    value="topic"
                    checked={formResTargetType === 'topic'}
                    onChange={() => setFormResTargetType('topic')}
                    className="text-primary"
                  />
                  <span>Current Topic ({questionTopics[0] || 'general'})</span>
                </label>
                {questionId && (
                  <label className="flex items-center gap-1.5 cursor-pointer min-h-[36px]">
                    <input
                      type="radio"
                      name="targetType"
                      value="question"
                      checked={formResTargetType === 'question'}
                      onChange={() => setFormResTargetType('question')}
                      className="text-primary"
                    />
                    <span>This Question Only (#{questionId})</span>
                  </label>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setEditingResource(null)}
                className="px-4 py-2.5 min-h-[42px] rounded-xl bg-surface-container hover:bg-surface-container-highest text-on-surface-variant text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 min-h-[42px] rounded-xl bg-primary hover:bg-primary-fixed-dim text-on-primary text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">save</span>
                <span>Save to JSON</span>
              </button>
            </div>
          </form>
        )}

        {/* Video / Web Resource Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {resources.map((res) => {
            const isYT = isYouTubeUrl(res.url);
            return (
              <div
                key={res.id}
                className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-surface-container border border-outline-variant/20 hover:border-primary/40 transition flex items-center justify-between gap-2.5 sm:gap-3 shadow-xs group"
              >
                <a
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-error/15 text-error flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">
                      {isYT ? 'play_circle' : 'language'}
                    </span>
                  </div>
                  <div className="truncate flex-1 min-w-0">
                    <div className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-primary transition-colors">
                      {res.label}
                    </div>
                    <div className="text-[11px] sm:text-xs font-mono-code text-on-surface-variant truncate">
                      {res.targetType === 'question' ? 'Question-specific' : 'Topic resource'} •{' '}
                      {isYT ? 'YouTube' : 'Web Link'}
                    </div>
                  </div>
                </a>

                <div className="flex items-center gap-1 shrink-0 text-on-surface-variant">
                  <button
                    onClick={(e) => handleOpenEditResourceForm(res, e)}
                    className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center hover:text-on-surface hover:bg-surface-container-high rounded-lg transition cursor-pointer"
                    title="Edit"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">edit</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteResource(res.id, e)}
                    className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center hover:text-error hover:bg-surface-container-high rounded-lg transition cursor-pointer"
                    title="Delete"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                  <a
                    className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center hover:text-primary hover:bg-surface-container-high rounded-lg transition"
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open Link"
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom Persistent Status Bar Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono-code text-on-surface-variant/60 pt-3 border-t border-outline-variant/15 gap-2">
        <div className="hidden sm:flex items-center gap-2">
          <span>Press</span>
          <kbd className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 font-semibold text-on-surface">
            Enter
          </kbd>
          <span>or</span>
          <kbd className="px-2.5 py-0.5 rounded bg-surface-container border border-outline-variant/30 font-semibold text-on-surface">
            Space
          </kbd>
          <span>to Advance Question</span>
        </div>
        <div className="flex sm:hidden items-center gap-1.5 text-on-surface-variant/80">
          <span className="material-symbols-outlined text-[16px] text-primary">touch_app</span>
          <span>Tap Proceed to Advance</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 text-on-surface-variant/60 text-[11px] sm:text-xs">
          <span>Local DB Synced</span>
          <span>•</span>
          <span className="text-mastery-emerald font-semibold">Telemetry Logged</span>
        </div>
      </div>
    </div>
  );
};

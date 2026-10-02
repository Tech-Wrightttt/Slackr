import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { QuestionCard } from '../components/QuestionCard';
import { ZoomableImage } from '../components/ZoomableImage';
import type { QuestionData, AttemptRecord, SRScheduleRecord } from '../db/schema';

export const QuestionHistory: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [schedule, setSchedule] = useState<SRScheduleRecord | null>(null);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    if (!id) return;
    try {
      const q = await QuestionsService.getQuestionById(id);
      setQuestion(q);

      const hist = await StatsDbService.getQuestionHistory(id);
      setAttempts(hist.attempts || []);
      setSchedule(hist.schedule || null);
    } catch (err) {
      console.error('Failed to load question history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleAnswerSubmitted = async (
    questionId: string,
    topic: string,
    selectedAnswer: string,
    isCorrect: boolean,
    timeSeconds: number,
    confidence: number
  ): Promise<{ schedule: SRScheduleRecord }> => {
    const res = await StatsDbService.recordAttempt(
      questionId,
      topic,
      selectedAnswer,
      isCorrect,
      timeSeconds,
      confidence
    );
    await loadData();
    return { schedule: res.schedule };
  };

  if (loading) {
    return (
      <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant flex flex-col items-center justify-center gap-3">
        <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
        <span>Retrieving item telemetry and performance audit...</span>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-2">search_off</span>
        <p className="font-headline font-semibold text-lg text-on-surface">Question {id} not found</p>
        <p className="text-xs font-mono-code text-on-surface-variant mt-1">This item might not exist in the current offline dataset.</p>
        <Link
          to="/analytics"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high border border-outline-variant/30 text-xs font-mono-code text-primary hover:border-primary/50 transition-all"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span>
          <span>Return to Telemetry Analytics</span>
        </Link>
      </div>
    );
  }

  const totalAttempts = attempts.length;
  const correctCount = attempts.filter((a) => a.isCorrect).length;
  const successRate = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
  const avgTime =
    totalAttempts > 0
      ? Math.round((attempts.reduce((s, a) => s + (a.timeSeconds || 0), 0) / totalAttempts) * 10) / 10
      : 0;

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 animate-in fade-in duration-300">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <Link
            to="/analytics"
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-xs font-mono-code text-on-surface-variant hover:text-on-surface hover:border-primary/40 transition-all"
          >
            <span className="material-symbols-outlined text-sm transition-transform group-hover:-translate-x-0.5">
              arrow_back
            </span>
            <span>Analytics</span>
          </Link>
          <div className="h-4 w-px bg-outline-variant/30" />
          <div className="flex items-center gap-2 font-mono-timer text-xs text-primary font-bold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
            <span>ITEM AUDIT TELEMETRY</span>
          </div>
        </div>

        <button
          onClick={() => setIsRetrying(!isRetrying)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-headline font-bold text-xs tracking-wider uppercase transition-all shadow-sm active:scale-95 ${
            isRetrying
              ? 'bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-container'
              : 'bg-primary text-on-primary hover:opacity-90'
          }`}
        >
          <span className="material-symbols-outlined text-sm">
            {isRetrying ? 'close' : 'rotate_left'}
          </span>
          <span>{isRetrying ? 'Close Practice Mode' : 'Practice Question'}</span>
        </button>
      </div>

      {/* If practice mode active */}
      {isRetrying && (
        <div className="p-4 sm:p-6 rounded-3xl border border-primary/30 bg-surface-container-low shadow-2xl relative animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/20">
            <div className="flex items-center gap-2 text-xs font-mono-code text-primary">
              <span className="material-symbols-outlined text-sm">terminal</span>
              <span>LIVE RETRIAL INSTANCE • METRICS WILL BE COMMITTED TO DEXIE</span>
            </div>
            <button
              onClick={() => setIsRetrying(false)}
              className="text-xs font-mono-code text-on-surface-variant hover:text-on-surface"
            >
              Exit Retrial
            </button>
          </div>
          <QuestionCard
            question={question}
            questionNumber={question.number || 1}
            totalQuestions={1}
            onAnswerSubmitted={handleAnswerSubmitted}
            onNextQuestion={() => setIsRetrying(false)}
            hasNext={false}
          />
        </div>
      )}

      {/* Question Details Card */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6 sm:p-8 space-y-6 relative overflow-hidden">
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-code text-2xl font-bold text-primary tracking-tight">
              {question.id}
            </span>
            <span className="bg-surface-container-high border border-outline-variant/30 px-2.5 py-0.5 rounded-full font-mono-code text-xs text-on-surface-variant font-medium">
              Year {question.year}
            </span>
            {question.session_title && (
              <span className="bg-surface-container-high border border-outline-variant/30 px-2.5 py-0.5 rounded-full font-mono-code text-xs text-on-surface-variant font-medium">
                {question.session_title}
              </span>
            )}
            {question.topics?.map((top) => (
              <span
                key={top}
                className="bg-primary/10 text-primary border border-primary/25 px-2.5 py-0.5 rounded-full font-mono-code text-xs uppercase tracking-wider font-semibold"
              >
                {top}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-mono-code text-primary">
            <span className="material-symbols-outlined text-sm">verified</span>
            <span>Key: Choice {question.correct_display}</span>
          </div>
        </div>

        {/* Stem content */}
        <div className="font-body text-base text-on-surface leading-relaxed">
          <MarkdownRenderer content={question.question} />
        </div>

        {/* Image / Schematics if present outside markdown */}
        {question.image_paths && question.image_paths.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-mono-timer text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-sm text-primary">schema</span>
              <span>TECHNICAL SCHEMATICS & DIAGRAM VIEWPORT</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {question.image_paths.map((img, i) => (
                <div key={i} className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
                  <ZoomableImage src={img} alt={`Diagram ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Candidate Options Matrix */}
        {question.options && Object.keys(question.options).length > 0 && (
          <div className="space-y-3 pt-2 border-t border-outline-variant/20">
            <div className="font-mono-timer text-xs text-on-surface-variant tracking-wider uppercase">
              Official Choice Architecture
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(question.options).map(([key, text]) => {
                const isCorrect = key.toUpperCase() === question.correct_display.toUpperCase();
                return (
                  <div
                    key={key}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                      isCorrect
                        ? 'border-primary/60 bg-primary/10 text-on-surface ring-1 ring-primary/20'
                        : 'border-outline-variant/20 bg-surface-container/40 text-on-surface-variant'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-7 h-7 rounded-lg font-mono-code font-bold text-xs shrink-0 ${
                        isCorrect
                          ? 'bg-primary text-on-primary'
                          : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/30'
                      }`}
                    >
                      {key}
                    </span>
                    <div className="flex-1 text-sm font-body pt-0.5 leading-snug">
                      <MarkdownRenderer content={text} />
                    </div>
                    {isCorrect && (
                      <span className="material-symbols-outlined text-primary text-base shrink-0">
                        check_circle
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Explanation section if available */}
        {question.explanation && (
          <div className="p-4 sm:p-5 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
            <div className="flex items-center gap-2 font-mono-timer text-xs text-primary font-bold">
              <span className="material-symbols-outlined text-sm">lightbulb</span>
              <span>EXAMINATION BOARD CANONICAL RATIONALE</span>
            </div>
            <div className="text-xs sm:text-sm text-on-surface font-body leading-relaxed">
              <MarkdownRenderer content={question.explanation} />
            </div>
          </div>
        )}
      </div>

      {/* Aggregated Question Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono-timer uppercase tracking-wider">Total Reps</span>
            <span className="material-symbols-outlined text-base">history</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-headline font-bold text-on-surface">{totalAttempts}</p>
            <p className="text-[11px] font-mono-code text-on-surface-variant mt-1">Logged attempts</p>
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono-timer uppercase tracking-wider">Success Rate</span>
            <span className="material-symbols-outlined text-base text-primary">percent</span>
          </div>
          <div className="mt-3">
            <p className={`text-2xl sm:text-3xl font-headline font-bold ${
              successRate >= 70 ? 'text-primary' : successRate >= 50 ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {successRate}%
            </p>
            <p className="text-[11px] font-mono-code text-on-surface-variant mt-1">
              {correctCount} / {totalAttempts} accurate
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono-timer uppercase tracking-wider">Mean Pace</span>
            <span className="material-symbols-outlined text-base text-secondary">timer</span>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-mono-timer font-bold text-on-surface">{avgTime}s</p>
            <p className="text-[11px] font-mono-code text-on-surface-variant mt-1">Target &le; 108s</p>
          </div>
        </div>

        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono-timer uppercase tracking-wider">SRS Interval</span>
            <span className="material-symbols-outlined text-base text-primary">calendar_clock</span>
          </div>
          <div className="mt-3">
            <p className="text-base sm:text-lg font-mono-code font-bold text-primary truncate">
              {schedule?.nextReviewDate
                ? new Date(schedule.nextReviewDate).toLocaleDateString()
                : 'Not Scheduled'}
            </p>
            <p className="text-[11px] font-mono-code text-on-surface-variant mt-1">
              {schedule ? `Rep #${schedule.repetitionNumber} • EF ${schedule.easinessFactor?.toFixed(2)}` : 'Awaiting trial'}
            </p>
          </div>
        </div>
      </div>

      {/* Chronological History Table */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">database</span>
            <h2 className="text-base font-headline font-bold text-on-surface">Attempt Audit Trail (Chronological)</h2>
          </div>
          <span className="font-mono-code text-xs text-on-surface-variant">
            {attempts.length} {attempts.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {attempts.length === 0 ? (
          <div className="py-12 text-center text-on-surface-variant font-mono-code text-xs border border-dashed border-outline-variant/30 rounded-xl">
            No attempts logged yet for this question. Click "Practice Question" above to initialize telemetry.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
            <table className="w-full divide-y divide-outline-variant/20 text-left text-xs font-body">
              <thead className="bg-surface-container-high/60 font-mono-timer font-semibold text-on-surface-variant uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Choice</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {attempts.map((att, idx) => (
                  <tr key={idx} className="hover:bg-surface-container-high/30 transition-colors">
                    <td className="px-4 py-3 font-mono-code text-on-surface-variant">{idx + 1}</td>
                    <td className="px-4 py-3 font-mono-code font-bold uppercase text-on-surface">
                      <span className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30">
                        {att.selectedAnswer}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {att.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-primary font-mono-code font-semibold">
                          <span className="material-symbols-outlined text-sm">check_circle</span>
                          <span>PASS</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-mono-code font-semibold">
                          <span className="material-symbols-outlined text-sm">cancel</span>
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono-timer text-on-surface">{att.timeSeconds}s</td>
                    <td className="px-4 py-3">
                      <div className="inline-flex items-center gap-1 font-mono-code text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-amber-400 text-sm">star</span>
                        <span>{att.confidence || 3}/5</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-code text-on-surface-variant text-[11px]">
                      {new Date(att.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

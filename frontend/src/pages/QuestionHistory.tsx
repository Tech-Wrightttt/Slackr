import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Award, Calendar, CheckCircle2, XCircle, RotateCcw, Star } from 'lucide-react';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { QuestionCard } from '../components/QuestionCard';
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
    return <div className="flex justify-center py-20 text-slate-400">Loading question history...</div>;
  }

  if (!question) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center text-slate-400">
        <p>Question {id} not found.</p>
        <Link to="/analytics" className="mt-4 inline-block text-sky-400 hover:underline">
          Return to Analytics
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/analytics"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Analytics</span>
        </Link>

        <button
          onClick={() => setIsRetrying(!isRetrying)}
          className="flex items-center gap-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 active:scale-95 transition-all"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{isRetrying ? 'Close Practice Mode' : 'Practice Question Again'}</span>
        </button>
      </div>

      {/* If practice mode active */}
      {isRetrying && (
        <div className="p-4 rounded-3xl border border-sky-500/30 bg-slate-900/90 shadow-2xl">
          <QuestionCard
            question={question}
            questionNumber={1}
            totalQuestions={1}
            onAnswerSubmitted={handleAnswerSubmitted}
            onNextQuestion={() => setIsRetrying(false)}
            hasNext={false}
          />
        </div>
      )}

      {/* Question Details Header */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xl font-bold text-sky-400">{question.id}</span>
          <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
            Year {question.year}
          </span>
          {question.topics?.map((top) => (
            <span
              key={top}
              className="rounded bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-300 border border-indigo-500/20 uppercase"
            >
              {top}
            </span>
          ))}
        </div>

        <div className="text-slate-200">
          <MarkdownRenderer content={question.question} />
        </div>

        <div className="pt-2 text-xs text-slate-400">
          Official Answer:{' '}
          <strong className="text-emerald-400 font-mono text-sm">{question.correct_display}</strong>
        </div>
      </div>

      {/* Aggregated Question Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <span className="text-xs text-slate-400">Total Attempts</span>
          <p className="mt-1 text-2xl font-bold text-white">{totalAttempts}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <span className="text-xs text-slate-400">Success Rate</span>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{successRate}%</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <span className="text-xs text-slate-400">Average Time</span>
          <p className="mt-1 text-2xl font-bold text-sky-400 font-mono">{avgTime}s</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <span className="text-xs text-slate-400">Next Review</span>
          <p className="mt-1 text-sm font-semibold text-purple-400 truncate">
            {schedule?.nextReviewDate
              ? new Date(schedule.nextReviewDate).toLocaleDateString()
              : 'Not Scheduled'}
          </p>
        </div>
      </div>

      {/* Chronological History Table */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
        <h2 className="text-lg font-bold text-white">Full Attempt Log (Chronological)</h2>

        {attempts.length === 0 ? (
          <p className="text-sm text-slate-400">No attempts logged yet for this question.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="bg-slate-950 font-semibold text-slate-400">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Selected Choice</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Time Open</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {attempts.map((att, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3 font-semibold uppercase text-slate-200">
                      {att.selectedAnswer}
                    </td>
                    <td className="px-4 py-3">
                      {att.isCorrect ? (
                        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Correct
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-rose-400 font-semibold">
                          <XCircle className="h-3.5 w-3.5" /> Incorrect
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">{att.timeSeconds}s</td>
                    <td className="px-4 py-3 text-amber-400">{att.confidence || 3}/5</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">
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

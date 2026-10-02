import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Layers,
  Filter,
  CheckSquare,
  Repeat,
  BarChart3,
  Flame,
  Award,
  Clock,
  ArrowRight,
  TrendingDown,
  AlertTriangle,
  Play,
  BookOpen,
} from 'lucide-react';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { db } from '../db';
import type { SRScheduleRecord } from '../db/schema';

export const Home: React.FC = () => {
  const [meta, setMeta] = useState<any>(null);
  const [totalAttempts, setTotalAttempts] = useState<number>(0);
  const [overallAccuracy, setOverallAccuracy] = useState<number>(0);
  const [dueReviews, setDueReviews] = useState<SRScheduleRecord[]>([]);
  const [topWeakSpots, setTopWeakSpots] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const metadata = await QuestionsService.loadMetadataSummary();
        setMeta(metadata);

        const attempts = await db.attempts.toArray();
        setTotalAttempts(attempts.length);
        if (attempts.length > 0) {
          const correct = attempts.filter((a) => a.isCorrect).length;
          setOverallAccuracy(Math.round((correct / attempts.length) * 1000) / 10);
        }

        const due = await StatsDbService.getDueReviews();
        setDueReviews(due);

        const weak = await AnalyticsEngine.getPriorityWeakSpots();
        setTopWeakSpots(weak.slice(0, 3));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8 animate-in fade-in duration-300">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 p-8 sm:p-10 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400">
            <Award className="h-3.5 w-3.5" />
            <span>PHILNITS Exam Reviewer • Offline-First</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Master the PHILNITS Exam with Precision Analytics
          </h1>
          <p className="text-base leading-relaxed text-slate-300 sm:text-lg">
            Practice across {meta?.total_questions || 3600}+ official questions from 2007 to 2026. Identify your
            weak areas with real-time confidence calibration and spaced repetition algorithms.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/quiz/year"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-sky-400 hover:to-indigo-500 active:scale-95 transition-all"
            >
              <Play className="h-4 w-4" />
              <span>Start Year Quiz</span>
            </Link>
            <Link
              to="/quiz/srs"
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-6 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <Repeat className="h-4 w-4 text-purple-400" />
              <span>Review Due ({dueReviews.length})</span>
            </Link>
          </div>
        </div>

        {/* Subtle background glow */}
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 right-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-400 border border-sky-500/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Total Questions</p>
              <p className="text-2xl font-bold text-white">{meta?.total_questions || 3609}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-400 border border-indigo-500/20">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Attempts Logged</p>
              <p className="text-2xl font-bold text-white">{totalAttempts}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400 border border-emerald-500/20">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Overall Accuracy</p>
              <p className="text-2xl font-bold text-emerald-400">
                {totalAttempts > 0 ? `${overallAccuracy}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-purple-500/10 p-2.5 text-purple-400 border border-purple-500/20">
              <Repeat className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Reviews Due</p>
              <p className="text-2xl font-bold text-purple-400">{dueReviews.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Priority Weak Spots Alert Box */}
      {topWeakSpots.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-bold text-slate-100">Priority Weak Spots Requiring Attention</h3>
            </div>
            <Link to="/analytics" className="text-xs text-amber-400 hover:underline flex items-center gap-1">
              <span>View full heatmap</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {topWeakSpots.map((ws) => (
              <div
                key={ws.topic}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-4"
              >
                <div>
                  <h4 className="text-sm font-bold text-slate-200 uppercase">{ws.topic}</h4>
                  <p className="text-xs text-rose-400">
                    Error rate: {ws.errorRate}% ({ws.incorrectAttempts}/{ws.totalAttempts})
                  </p>
                </div>
                <Link
                  to={`/quiz/topic?topic=${ws.topic}`}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-slate-700 transition-colors"
                >
                  Practice
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Study Modes Grid */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Exam Review Modes</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/quiz/year"
            className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm hover:border-sky-500/50 hover:bg-slate-900 transition-all"
          >
            <div className="mb-4 inline-block rounded-xl bg-sky-500/10 p-3 text-sky-400 border border-sky-500/20 group-hover:scale-110 transition-transform">
              <Calendar className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-sky-400 transition-colors">
              Tab 1: By Exam Year
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Practice questions from specific exam seasons (2007 through 2026).
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-sky-400">
              <span>Start year review</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/quiz/topic"
            className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm hover:border-indigo-500/50 hover:bg-slate-900 transition-all"
          >
            <div className="mb-4 inline-block rounded-xl bg-indigo-500/10 p-3 text-indigo-400 border border-indigo-500/20 group-hover:scale-110 transition-transform">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-indigo-400 transition-colors">
              Tab 2: By Topic
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Drill deep into 29 official categories (networking, algorithms, databases, etc.).
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-400">
              <span>Explore topics</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/quiz/combined"
            className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm hover:border-purple-500/50 hover:bg-slate-900 transition-all"
          >
            <div className="mb-4 inline-block rounded-xl bg-purple-500/10 p-3 text-purple-400 border border-purple-500/20 group-hover:scale-110 transition-transform">
              <Filter className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
              Tab 3: Combined Filters
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Target questions matching both a specific year AND topic category simultaneously.
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-purple-400">
              <span>Filter matrix</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          <Link
            to="/quiz/custom"
            className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm hover:border-emerald-500/50 hover:bg-slate-900 transition-all"
          >
            <div className="mb-4 inline-block rounded-xl bg-emerald-500/10 p-3 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <CheckSquare className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
              Tab 4: Custom Quiz
            </h3>
            <p className="mt-2 text-sm text-slate-400">
              Build personalized problem sets with custom question selection and reusable sets.
            </p>
            <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-emerald-400">
              <span>Build custom quiz</span>
              <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Clock,
  Award,
  Search,
  ArrowUpDown,
  Layers,
  Star,
  Calendar,
  Eye,
  Info,
} from 'lucide-react';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { db } from '../db';
import type { AttemptRecord } from '../db/schema';

export const Analytics: React.FC = () => {
  const [errorRates, setErrorRates] = useState<any[]>([]);
  const [weakSpots, setWeakSpots] = useState<any[]>([]);
  const [consistency, setConsistency] = useState<any>(null);
  const [calibration, setCalibration] = useState<any>(null);
  const [heatmapData, setHeatmapData] = useState<any>(null);
  const [heatmapInterval, setHeatmapInterval] = useState<'day' | 'week' | 'month'>('week');
  const [recentAttempts, setRecentAttempts] = useState<AttemptRecord[]>([]);

  // TanStack table state
  const [tableSearch, setTableSearch] = useState<string>('');
  const [sortField, setSortField] = useState<string>('errorRate');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);

  const loadAnalytics = async () => {
    try {
      const [rates, weak, cons, calib, hmap, atts] = await Promise.all([
        AnalyticsEngine.getErrorRates(),
        AnalyticsEngine.getPriorityWeakSpots(),
        AnalyticsEngine.getConsistencyScore(),
        AnalyticsEngine.getConfidenceCalibration(),
        AnalyticsEngine.getHeatmap(heatmapInterval),
        db.attempts.orderBy('timestamp').reverse().limit(15).toArray(),
      ]);

      setErrorRates(rates);
      setWeakSpots(weak);
      setConsistency(cons);
      setCalibration(calib);
      setHeatmapData(hmap);
      setRecentAttempts(atts);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [heatmapInterval]);

  // Sort and filter table data
  const sortedTableData = useMemo(() => {
    return errorRates
      .filter((r) => r.topic.toLowerCase().includes(tableSearch.toLowerCase()))
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (typeof valA === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [errorRates, tableSearch, sortField, sortAsc]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-slate-400">Computing analytics...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-10 animate-in fade-in duration-300">
      {/* Title */}
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/20">
            Analytics & Weakness Tracking
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-4xl">Performance Intelligence</h1>
        <p className="mt-1 text-sm text-slate-400">
          Comprehensive error rates, confidence calibration, consistency score, and multi-dimensional topic heatmap.
        </p>
      </div>

      {/* Top 3 KPI Cards: Consistency, Calibration, Learning Trend */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Consistency Score Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Consistency Score
            </span>
            <div className="flex items-center gap-1 text-xs">
              {consistency?.trend === 'improving' ? (
                <span className="flex items-center gap-1 text-emerald-400">
                  <TrendingUp className="h-3.5 w-3.5" /> Improving
                </span>
              ) : consistency?.trend === 'declining' ? (
                <span className="flex items-center gap-1 text-rose-400">
                  <TrendingDown className="h-3.5 w-3.5" /> Declining
                </span>
              ) : (
                <span className="text-slate-400">Stable</span>
              )}
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-white">
              {consistency ? `${consistency.overallConsistency}%` : '100%'}
            </span>
            <span className="text-xs text-slate-400">
              (std dev: {consistency?.stdDeviation || 0}%)
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Measures accuracy stability across rolling 5-attempt windows. Lower variance yields a higher consistency rating.
          </p>
        </div>

        {/* Confidence Calibration Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Calibration Accuracy
            </span>
            <span className="text-xs text-slate-400">
              Brier: {calibration?.brierScore || 0}
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-sky-400">
              {calibration?.hasData ? `${calibration.calibrationAccuracy}%` : '—'}
            </span>
            <span className="text-xs text-slate-400">
              ({calibration?.totalEvaluated || 0} rated)
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>
              Overconfidence:{' '}
              <strong className="text-rose-400">{calibration?.overconfidenceRate || 0}%</strong>
            </span>
            <span>
              Underconfidence:{' '}
              <strong className="text-amber-400">{calibration?.underconfidenceRate || 0}%</strong>
            </span>
          </div>
        </div>

        {/* Priority Focus Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Priority Weak Spot
          </span>
          {weakSpots.length > 0 ? (
            <div className="mt-4">
              <span className="text-2xl font-bold uppercase text-rose-400">
                {weakSpots[0].topic}
              </span>
              <p className="mt-1 text-xs text-slate-400">
                Error rate: <strong>{weakSpots[0].errorRate}%</strong> on{' '}
                {weakSpots[0].totalAttempts} attempts
              </p>
              <div className="mt-4">
                <Link
                  to={`/quiz/topic?topic=${weakSpots[0].topic}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition-all"
                >
                  <span>Practice Weak Spot</span>
                  <Award className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-400">
              No weak areas identified yet. Complete questions to generate insights.
            </div>
          )}
        </div>
      </div>

      {/* Priority Weak Spots Ranked List (Task 18) */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <h2 className="text-lg font-bold text-white">Priority Weak Spots (Ranked by Error & Recency)</h2>
          </div>
          <span className="text-xs text-slate-500">Auto-ranked</span>
        </div>

        {weakSpots.length === 0 ? (
          <p className="text-sm text-slate-400">Start answering questions to populate your ranked weak spot list.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weakSpots.map((ws, idx) => (
              <div
                key={ws.topic}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
                      #{idx + 1}
                    </span>
                    <h3 className="text-sm font-bold uppercase text-slate-200">{ws.topic}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        ws.status === 'critical'
                          ? 'text-rose-400'
                          : ws.status === 'moderate'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {ws.errorRate}% error
                    </span>
                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400">{ws.incorrectAttempts}/{ws.totalAttempts} failed</span>
                  </div>
                </div>

                <Link
                  to={`/quiz/topic?topic=${ws.topic}`}
                  className="rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 transition-all"
                >
                  Practice Now
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Topic Weakness Heatmap Matrix (Task 20) */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Topic Weakness Heatmap Matrix</h2>
            <p className="text-xs text-slate-400">
              Tracking error rate progression across all 29 categories over time periods.
            </p>
          </div>

          {/* Interval Selector */}
          <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1 text-xs">
            <button
              onClick={() => setHeatmapInterval('day')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                heatmapInterval === 'day' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => setHeatmapInterval('week')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                heatmapInterval === 'week' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setHeatmapInterval('month')}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                heatmapInterval === 'month' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-slate-800 border border-slate-700" />
            No attempts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-emerald-500/30 border border-emerald-500/50" />
            Strong (&lt;25% err)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-amber-500/30 border border-amber-500/50" />
            Moderate (25-49% err)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-rose-500/40 border border-rose-500/60" />
            Weak (&gt;50% err)
          </span>
        </div>

        {/* 2D Scrollable Heatmap Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-950 px-3 py-2 text-left font-semibold text-slate-400 z-10 w-48">
                  Topic Category
                </th>
                {heatmapData?.periods?.map((p: string) => (
                  <th key={p} className="px-3 py-2 text-center font-semibold text-slate-400 min-w-[70px]">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {heatmapData &&
                Object.entries(heatmapData.matrix).map(([topic, cells]: any) => (
                  <tr key={topic} className="hover:bg-slate-900/40">
                    <td className="sticky left-0 bg-slate-950 px-3 py-2 font-medium uppercase text-slate-300 z-10 truncate max-w-[190px]">
                      {topic}
                    </td>
                    {cells.map((cell: any, i: number) => {
                      let bgClass = 'bg-slate-900/60 text-slate-600 border-slate-800/80';
                      if (cell.attemptCount > 0) {
                        if (cell.errorRate >= 50) {
                          bgClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-semibold';
                        } else if (cell.errorRate >= 25) {
                          bgClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold';
                        } else {
                          bgClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold';
                        }
                      }
                      return (
                        <td key={i} className="p-1 text-center">
                          <div
                            title={`Period: ${cell.period}\nAttempts: ${cell.attemptCount}\nError Rate: ${
                              cell.errorRate !== null ? `${cell.errorRate}%` : 'N/A'
                            }\nAvg Time: ${cell.avgTimeSec}s`}
                            className={`rounded-lg border px-1.5 py-1 text-[11px] transition-transform hover:scale-105 cursor-pointer ${bgClass}`}
                          >
                            {cell.attemptCount > 0 ? `${cell.errorRate}%` : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confidence Calibration Curve Breakdown (Task 19) */}
      {calibration?.hasData && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Confidence Calibration Analysis</h2>
          </div>
          <p className="text-xs text-slate-400">
            Comparing pre-reveal certainty vs. actual observed success. Perfect calibration occurs when your actual accuracy matches your stated confidence probability.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 pt-2">
            {calibration.bins.map((bin: any) => {
              const isOver = bin.actualAccuracy < bin.expectedAccuracy && bin.totalAttempts > 0;
              return (
                <div
                  key={bin.confidenceLevel}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2 text-center"
                >
                  <span className="text-xs font-bold text-amber-400">{bin.label}</span>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400">
                      Expected: <strong className="text-slate-200">{bin.expectedAccuracy}%</strong>
                    </p>
                    <p className="text-lg font-extrabold text-white">
                      Actual: {bin.totalAttempts > 0 ? `${bin.actualAccuracy}%` : '—'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      ({bin.correctAttempts}/{bin.totalAttempts} correct)
                    </p>
                  </div>
                  {bin.totalAttempts > 0 && (
                    <div
                      className={`text-[10px] font-semibold rounded px-1.5 py-0.5 inline-block ${
                        isOver ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {bin.gap >= 0 ? `+${bin.gap}% gain` : `${bin.gap}% gap`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sortable TanStack Table: All Topics (Task 17) */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Topic Performance Metrics Table</h2>
            <p className="text-xs text-slate-400">Sort by any column to analyze speed and accuracy patterns.</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Filter topics..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
          <table className="w-full divide-y divide-slate-800 text-left text-xs">
            <thead className="bg-slate-950 font-semibold text-slate-400">
              <tr>
                <th
                  onClick={() => handleSort('topic')}
                  className="cursor-pointer px-4 py-3 hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Topic</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('totalAttempts')}
                  className="cursor-pointer px-4 py-3 hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Total Attempts</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('correctAttempts')}
                  className="cursor-pointer px-4 py-3 hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Correct</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('incorrectAttempts')}
                  className="cursor-pointer px-4 py-3 hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Incorrect</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('errorRate')}
                  className="cursor-pointer px-4 py-3 hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Error Rate</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('avgTimeSeconds')}
                  className="cursor-pointer px-4 py-3 hover:text-white"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Avg Time</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {sortedTableData.map((row) => (
                <tr key={row.topic} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-4 py-3 font-semibold uppercase text-slate-200">{row.topic}</td>
                  <td className="px-4 py-3 text-slate-300">{row.totalAttempts}</td>
                  <td className="px-4 py-3 text-emerald-400 font-semibold">{row.correctAttempts}</td>
                  <td className="px-4 py-3 text-rose-400 font-semibold">{row.incorrectAttempts}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 font-bold ${
                        row.totalAttempts === 0
                          ? 'text-slate-600'
                          : row.errorRate >= 50
                          ? 'bg-rose-500/10 text-rose-400'
                          : row.errorRate >= 25
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {row.totalAttempts > 0 ? `${row.errorRate}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono">
                    {row.totalAttempts > 0 ? `${row.avgTimeSeconds}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/quiz/topic?topic=${row.topic}`}
                      className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-sky-400 hover:bg-slate-700 transition-colors"
                    >
                      Practice
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Question History Section (Task 21 linking) */}
      {recentAttempts.length > 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Recent Attempt History</h2>
            <span className="text-xs text-slate-500">Click any Question ID for full audit trail</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="bg-slate-950 font-semibold text-slate-400">
                <tr>
                  <th className="px-4 py-3">Question ID</th>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {recentAttempts.map((a, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/history/${a.questionId}`}
                        className="font-mono font-semibold text-sky-400 hover:underline"
                      >
                        {a.questionId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 uppercase text-slate-300">{a.topic}</td>
                    <td className="px-4 py-3">
                      {a.isCorrect ? (
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          CORRECT
                        </span>
                      ) : (
                        <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                          INCORRECT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">{a.timeSeconds}s</td>
                    <td className="px-4 py-3 text-amber-400">{a.confidence || 3}/5</td>
                    <td className="px-4 py-3 text-right text-slate-500 font-mono">
                      {new Date(a.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

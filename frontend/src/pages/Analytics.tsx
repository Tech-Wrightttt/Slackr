import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AnalyticsEngine, type ExamTypeImprovementData, type ExamTypeTimelinePoint } from '../services/analyticsEngine';
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

  // FE-A vs FE-B Exam Type Improvement Telemetry State
  const [examTypeStats, setExamTypeStats] = useState<ExamTypeImprovementData | null>(null);
  const [graphMetric, setGraphMetric] = useState<'accuracy' | 'pace' | 'improvement'>('accuracy');
  const [graphFilter, setGraphFilter] = useState<'both' | 'feA' | 'feB'>('both');
  const [timeRange, setTimeRange] = useState<'all' | '30d' | '14d' | '7d'>('all');
  const [hoveredPoint, setHoveredPoint] = useState<ExamTypeTimelinePoint | null>(null);
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<'all' | 'feA' | 'feB'>('all');

  // Table sorting & filtering
  const [tableSearch, setTableSearch] = useState<string>('');
  const [sortField, setSortField] = useState<string>('errorRate');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(true);

  const loadAnalytics = async () => {
    try {
      const [rates, weak, cons, calib, hmap, atts, exStats] = await Promise.all([
        AnalyticsEngine.getErrorRates(),
        AnalyticsEngine.getPriorityWeakSpots(),
        AnalyticsEngine.getConsistencyScore(),
        AnalyticsEngine.getConfidenceCalibration(),
        AnalyticsEngine.getHeatmap(heatmapInterval),
        db.attempts.orderBy('timestamp').reverse().limit(15).toArray(),
        AnalyticsEngine.getExamTypeImprovementStats(),
      ]);

      setErrorRates(rates);
      setWeakSpots(weak);
      setConsistency(cons);
      setCalibration(calib);
      setHeatmapData(hmap);
      setRecentAttempts(atts);
      setExamTypeStats(exStats);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [heatmapInterval]);

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

  const filteredTimeline = useMemo(() => {
    if (!examTypeStats?.timeline) return [];
    const list = examTypeStats.timeline;
    if (timeRange === 'all') return list;
    const now = Date.now();
    const days = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30;
    const cutoff = now - days * 86400000;
    return list.filter((p) => new Date(p.timestamp).getTime() >= cutoff);
  }, [examTypeStats, timeRange]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const attempts = await db.attempts.toArray();
      if (attempts.length === 0) {
        alert('No attempts available to export.');
        return;
      }
      const headers = ['Attempt ID', 'Question ID', 'Topic', 'Selected Answer', 'Is Correct', 'Time (s)', 'Confidence', 'Timestamp'];
      const rows = attempts.map((a, i) => [
        `#ATT-${a.id || i + 1}`,
        `"${a.questionId}"`,
        `"${a.topic}"`,
        `"${a.selectedAnswer}"`,
        a.isCorrect ? 'TRUE' : 'FALSE',
        a.timeSeconds?.toFixed(1) || '0',
        a.confidence || '3',
        `"${a.timestamp}"`,
      ]);
      const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const uri = encodeURI(csv);
      const a = document.createElement('a');
      a.href = uri;
      a.download = `slackr_analytics_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant">
        Computing statistical telemetry models...
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-outline-variant/20">
        <div className="flex flex-col gap-1 max-w-2xl">
          <div className="flex items-center gap-2 font-mono-timer text-xs text-primary">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
            <span>STATISTICAL COGNITIVE TELEMETRY</span>
          </div>
          <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
            Performance Intelligence
          </h1>
          <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
            Multi-dimensional error telemetry, Brier calibration scoring, and temporal curriculum heatmaps.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-xs font-mono-code text-on-surface transition-colors cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px] text-primary">download</span>
          <span>Export Attempt Ledger (CSV)</span>
        </button>
      </div>

      {/* Top 3 KPI Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Consistency Score Card */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              Consistency Index
            </span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[16px]">show_chart</span>
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2 font-mono-code">
            <span className="font-headline-md text-3xl font-extrabold text-on-surface">
              {consistency ? `${consistency.overallConsistency}%` : '100%'}
            </span>
            <span className="text-xs text-on-surface-variant">
              (σ: {consistency?.stdDeviation || 0}%)
            </span>
          </div>

          <p className="mt-2 text-xs font-mono-code text-on-surface-variant leading-relaxed">
            Accuracy stability across rolling 5-attempt windows. Lower variance indicates higher exam readiness.
          </p>
        </div>

        {/* Confidence Calibration Card */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              Metacognitive Calibration
            </span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-confidence-amber">
              <span className="material-symbols-outlined text-[16px]">grade</span>
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2 font-mono-code">
            <span className="font-headline-md text-3xl font-extrabold text-confidence-amber">
              {calibration?.hasData ? `${calibration.calibrationAccuracy}%` : '—'}
            </span>
            <span className="text-xs text-on-surface-variant">
              Brier: {calibration?.brierScore || '0.00'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between text-xs font-mono-code text-on-surface-variant">
            <span>
              Overconfident: <strong className="text-error">{calibration?.overconfidenceRate || 0}%</strong>
            </span>
            <span>
              Underconfident: <strong className="text-primary">{calibration?.underconfidenceRate || 0}%</strong>
            </span>
          </div>
        </div>

        {/* Priority Focus Card */}
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
              Priority Weak Spot
            </span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-[16px]">warning</span>
            </span>
          </div>

          {weakSpots.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              <span className="font-headline-md text-xl font-bold uppercase text-error truncate">
                {weakSpots[0].topic}
              </span>
              <p className="text-xs font-mono-code text-on-surface-variant">
                Error Rate: <strong className="text-error">{weakSpots[0].errorRate}%</strong> on{' '}
                {weakSpots[0].totalAttempts} attempts
              </p>
              <Link
                to={`/quiz/topic?topic=${encodeURIComponent(weakSpots[0].topic)}`}
                className="mt-2 inline-flex items-center gap-1.5 w-fit px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-mono-code text-xs font-semibold hover:bg-primary transition-all shadow-sm"
              >
                <span>Drill Category</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          ) : (
            <div className="mt-4 text-xs font-mono-code text-on-surface-variant">
              No critical weak spots detected yet. Log attempts to calibrate.
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FE-A vs FE-B EXAM TYPE IMPROVEMENT INTELLIGENCE (INTERACTIVE MATRIX)     */}
      {/* ========================================================================= */}
      {examTypeStats && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6 sm:p-8 shadow-xl flex flex-col gap-6 relative overflow-hidden animate-in fade-in duration-300">
          {/* Section Header & PHILNITS Benchmark Strip */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
            <div className="flex flex-col gap-1 max-w-3xl">
              <div className="flex items-center gap-2 font-mono-timer text-xs text-primary font-bold">
                <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
                <span>EXAM SPECIFICATION MATRIX // SUBJECT A vs SUBJECT B</span>
              </div>
              <h2 className="font-display-lg text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
                Exam Type Progression &amp; Difficulty Analytics
              </h2>
              <p className="font-body-base text-xs sm:text-sm text-on-surface-variant leading-relaxed">
                PHILNITS requires passing both <strong>Subject A</strong> (Morning / Fundamentals: 60–80 MCQs) and{' '}
                <strong>Subject B</strong> (Afternoon / Applied Problem Solving: 20 Advanced Case Studies).
                Track your learning velocity, response latency, and difficulty gap over time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0 font-mono-code text-xs">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-confidence-amber/15 border border-confidence-amber/30 text-confidence-amber font-semibold">
                <span className="material-symbols-outlined text-sm">flag</span>
                <span>PHILNITS STANDARD: &ge; 60% PASS MARK</span>
              </div>
              {!examTypeStats.hasRealData && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high border border-outline-variant/30 text-[11px] text-on-surface-variant">
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                  <span>Benchmark Baseline</span>
                </div>
              )}
            </div>
          </div>

          {/* 3 Comparative Head-to-Head Bento Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono-code">
            {/* 1. Subject A (FE-A / AM) */}
            <div className="rounded-xl border border-mastery-emerald/30 bg-surface-container/60 p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-mastery-emerald/50 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-mastery-emerald/5 rounded-bl-full pointer-events-none" />
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] px-2 py-0.5 rounded bg-mastery-emerald/15 text-mastery-emerald font-bold uppercase tracking-wider">
                    Subject A (FE-A / AM)
                  </span>
                  <span className="text-[11px] text-on-surface-variant">60–80 MCQs</span>
                </div>

                <div>
                  <span className="text-xs text-on-surface-variant uppercase">Current Rolling Accuracy</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-3xl font-headline font-bold text-mastery-emerald">
                      {examTypeStats.feA.recentAccuracy}%
                    </span>
                    <span
                      className={`text-xs font-bold inline-flex items-center gap-0.5 ${
                        examTypeStats.feA.improvementDelta >= 0 ? 'text-mastery-emerald' : 'text-error'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">
                        {examTypeStats.feA.improvementDelta >= 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      {examTypeStats.feA.improvementDelta >= 0 ? '+' : ''}
                      {examTypeStats.feA.improvementDelta}% velocity
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-outline-variant/20 text-on-surface-variant">
                  <div>
                    <span className="text-[10px] uppercase">Mean Response Pace</span>
                    <p className="font-bold text-on-surface text-sm mt-0.5">{examTypeStats.feA.avgTimeSeconds}s</p>
                    <span className="text-[10px] text-on-surface-variant/70">Target: &le; 108s</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase">Reps Logged</span>
                    <p className="font-bold text-on-surface text-sm mt-0.5">
                      {examTypeStats.feA.correctAttempts} / {examTypeStats.feA.totalAttempts}
                    </p>
                    <span className="text-[10px] text-mastery-emerald font-medium">
                      {examTypeStats.feA.recentAccuracy >= 60 ? '✓ Above Pass Mark' : 'Approaching'}
                    </span>
                  </div>
                </div>

                {examTypeStats.feA.topHardTopics.length > 0 && (
                  <div className="pt-2 border-t border-outline-variant/20">
                    <span className="text-[10px] text-on-surface-variant uppercase">Challenging Subject A Areas:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {examTypeStats.feA.topHardTopics.map((t) => (
                        <span
                          key={t.topic}
                          className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-[10px] text-on-surface-variant"
                        >
                          #{t.topic} ({t.errorRate}% err)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link
                to="/quiz/year"
                className="mt-4 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-container-high hover:bg-mastery-emerald/20 text-mastery-emerald border border-mastery-emerald/30 text-xs font-bold transition-all cursor-pointer"
              >
                <span>Drill Subject A Papers</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>

            {/* 2. Subject B (FE-B / PM) */}
            <div className="rounded-xl border border-confidence-amber/30 bg-surface-container/60 p-5 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-confidence-amber/50 transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-confidence-amber/5 rounded-bl-full pointer-events-none" />
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] px-2 py-0.5 rounded bg-confidence-amber/15 text-confidence-amber font-bold uppercase tracking-wider">
                    Subject B (FE-B / PM) • High Difficulty
                  </span>
                  <span className="text-[11px] text-confidence-amber font-bold">20 Problems</span>
                </div>

                <div>
                  <span className="text-xs text-on-surface-variant uppercase">Current Rolling Accuracy</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span
                      className={`text-3xl font-headline font-bold ${
                        examTypeStats.feB.recentAccuracy >= 60 ? 'text-mastery-emerald' : 'text-confidence-amber'
                      }`}
                    >
                      {examTypeStats.feB.recentAccuracy}%
                    </span>
                    <span
                      className={`text-xs font-bold inline-flex items-center gap-0.5 ${
                        examTypeStats.feB.improvementDelta >= 0 ? 'text-confidence-amber' : 'text-error'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">
                        {examTypeStats.feB.improvementDelta >= 0 ? 'trending_up' : 'trending_down'}
                      </span>
                      {examTypeStats.feB.improvementDelta >= 0 ? '+' : ''}
                      {examTypeStats.feB.improvementDelta}% velocity
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-outline-variant/20 text-on-surface-variant">
                  <div>
                    <span className="text-[10px] uppercase">Mean Response Pace</span>
                    <p className="font-bold text-on-surface text-sm mt-0.5">{examTypeStats.feB.avgTimeSeconds}s</p>
                    <span className="text-[10px] text-on-surface-variant/70">Target: &le; 240s</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase">Reps Logged</span>
                    <p className="font-bold text-on-surface text-sm mt-0.5">
                      {examTypeStats.feB.correctAttempts} / {examTypeStats.feB.totalAttempts}
                    </p>
                    <span
                      className={`text-[10px] font-medium ${
                        examTypeStats.feB.recentAccuracy >= 60 ? 'text-mastery-emerald' : 'text-confidence-amber'
                      }`}
                    >
                      {examTypeStats.feB.recentAccuracy >= 60
                        ? '✓ Above 60% Benchmark'
                        : `${Math.round(60 - examTypeStats.feB.recentAccuracy)}% to Pass Target`}
                    </span>
                  </div>
                </div>

                {examTypeStats.feB.topHardTopics.length > 0 && (
                  <div className="pt-2 border-t border-outline-variant/20">
                    <span className="text-[10px] text-on-surface-variant uppercase">Challenging Subject B Areas:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {examTypeStats.feB.topHardTopics.map((t) => (
                        <span
                          key={t.topic}
                          className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-[10px] text-confidence-amber"
                        >
                          #{t.topic} ({t.errorRate}% err)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Link
                to="/quiz/year"
                className="mt-4 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-surface-container-high hover:bg-confidence-amber/20 text-confidence-amber border border-confidence-amber/30 text-xs font-bold transition-all cursor-pointer"
              >
                <span>Drill Subject B (Pseudocode &amp; Case Studies)</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>

            {/* 3. Difficulty Gap & Examination Diagnosis */}
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container/60 p-5 shadow-sm flex flex-col justify-between">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                    Cognitive Difficulty Differential
                  </span>
                  <span className="material-symbols-outlined text-tertiary text-base">psychology</span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-on-surface-variant uppercase">Subject B Difficulty Delta</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-headline font-bold text-tertiary">
                      +{examTypeStats.difficultyGap.feBHarderPercent}%
                    </span>
                    <span className="text-xs text-on-surface-variant">harder error gap</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Requires <strong>{examTypeStats.difficultyGap.paceRatio}x</strong> more cognitive processing time
                    per question.
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-surface-container-high border border-outline-variant/20 text-xs font-body text-on-surface-variant leading-relaxed">
                  <strong className="text-on-surface block font-mono-code text-[11px] mb-1">
                    💡 PHILNITS Strategic Recommendation:
                  </strong>
                  Failing Subject B is the primary cause of exam failure across examinees with high Subject A scores.
                  Allocate 60–70% of remaining drill sessions to algorithmic tracing and cybersecurity scenarios.
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between text-[11px] text-on-surface-variant">
                <span>Pass Rule: 60% A &amp; 60% B</span>
                <span className="text-primary font-bold">Independent Cutoffs</span>
              </div>
            </div>
          </div>

          {/* Interactive Multi-Line Progression Graph Canvas */}
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 sm:p-6 flex flex-col gap-4">
            {/* Graph Controls Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-outline-variant/20">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono-timer text-xs text-on-surface-variant uppercase">Telemetry Metric:</span>
                <div className="flex items-center p-0.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs font-mono-code">
                  <button
                    type="button"
                    onClick={() => setGraphMetric('accuracy')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      graphMetric === 'accuracy'
                        ? 'bg-surface-container-highest text-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Accuracy (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphMetric('pace')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      graphMetric === 'pace'
                        ? 'bg-surface-container-highest text-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Response Pace (s)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphMetric('improvement')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      graphMetric === 'improvement'
                        ? 'bg-surface-container-highest text-primary font-bold shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Velocity Growth (&Delta;%)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Series Focus Filter */}
                <div className="flex items-center gap-1.5 font-mono-code text-xs">
                  <button
                    type="button"
                    onClick={() => setGraphFilter('both')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                      graphFilter === 'both'
                        ? 'bg-surface-container-high border-outline-variant text-on-surface font-bold'
                        : 'border-transparent text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span>Both</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphFilter('feA')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                      graphFilter === 'feA'
                        ? 'bg-mastery-emerald/15 border-mastery-emerald/40 text-mastery-emerald font-bold'
                        : 'border-transparent text-on-surface-variant hover:text-mastery-emerald'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-mastery-emerald" />
                    <span>Subject A</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraphFilter('feB')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md border transition-all cursor-pointer ${
                      graphFilter === 'feB'
                        ? 'bg-confidence-amber/15 border-confidence-amber/40 text-confidence-amber font-bold'
                        : 'border-transparent text-on-surface-variant hover:text-confidence-amber'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-confidence-amber" />
                    <span>Subject B</span>
                  </button>
                </div>

                <div className="h-4 w-px bg-outline-variant/30 hidden sm:block" />

                {/* Time Range Filter */}
                <div className="flex items-center p-0.5 rounded-lg bg-surface-container border border-outline-variant/30 text-xs font-mono-code">
                  <button
                    type="button"
                    onClick={() => setTimeRange('all')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timeRange === 'all'
                        ? 'bg-surface-container-highest text-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange('30d')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timeRange === '30d'
                        ? 'bg-surface-container-highest text-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    30D
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange('14d')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timeRange === '14d'
                        ? 'bg-surface-container-highest text-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    14D
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange('7d')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      timeRange === '7d'
                        ? 'bg-surface-container-highest text-primary font-bold'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    7D
                  </button>
                </div>
              </div>
            </div>

            {/* SVG Graph Drawing Canvas */}
            <div className="relative w-full h-64 sm:h-72 select-none">
              {(() => {
                const points = filteredTimeline.length > 0 ? filteredTimeline : examTypeStats.timeline;
                if (points.length === 0) {
                  return (
                    <div className="h-full flex items-center justify-center font-mono-code text-xs text-on-surface-variant">
                      No session data points match the selected time window.
                    </div>
                  );
                }

                const chartWidth = 840;
                const chartHeight = 240;
                const padLeft = 60;
                const padRight = 35;
                const padTop = 25;
                const padBottom = 35;
                const plotWidth = chartWidth - padLeft - padRight;
                const plotHeight = chartHeight - padTop - padBottom;

                const getX = (idx: number) => {
                  if (points.length <= 1) return padLeft + plotWidth / 2;
                  return padLeft + (idx / (points.length - 1)) * plotWidth;
                };

                let minY = 0;
                let maxY = 100;
                let yTicks = [0, 25, 50, 60, 75, 100];
                let getY = (val: number) => padTop + (1 - Math.max(minY, Math.min(maxY, val)) / (maxY - minY)) * plotHeight;

                if (graphMetric === 'pace') {
                  minY = 0;
                  maxY = 240;
                  yTicks = [0, 60, 120, 180, 240];
                  getY = (val: number) => padTop + (1 - Math.min(maxY, val) / maxY) * plotHeight;
                } else if (graphMetric === 'improvement') {
                  minY = -10;
                  maxY = 40;
                  yTicks = [-10, 0, 10, 20, 30, 40];
                  getY = (val: number) => padTop + (1 - (val - minY) / (maxY - minY)) * plotHeight;
                }

                const passMarkY = graphMetric === 'accuracy' ? getY(60) : null;

                // Points for FE-A
                const ptsA = points.map((p, idx) => {
                  let v = graphMetric === 'accuracy' ? p.feARolling : graphMetric === 'pace' ? p.feAPace : p.feAImprovement;
                  return { x: getX(idx), y: getY(v), raw: v, p };
                });

                // Points for FE-B
                const ptsB = points.map((p, idx) => {
                  let v = graphMetric === 'accuracy' ? p.feBRolling : graphMetric === 'pace' ? p.feBPace : p.feBImprovement;
                  return { x: getX(idx), y: getY(v), raw: v, p };
                });

                const buildPath = (pts: Array<{ x: number; y: number }>) => {
                  if (pts.length === 0) return '';
                  return pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
                };

                const buildArea = (pts: Array<{ x: number; y: number }>) => {
                  if (pts.length === 0) return '';
                  const line = buildPath(pts);
                  const last = pts[pts.length - 1];
                  const first = pts[0];
                  const base = padTop + plotHeight;
                  return `${line} L ${last.x.toFixed(1)} ${base} L ${first.x.toFixed(1)} ${base} Z`;
                };

                const pathA = buildPath(ptsA);
                const areaA = buildArea(ptsA);
                const pathB = buildPath(ptsB);
                const areaB = buildArea(ptsB);

                const activePoint = hoveredPoint || points[points.length - 1];
                const activeIndex = points.findIndex((p) => p.id === activePoint?.id);
                const activeX = activeIndex !== -1 ? getX(activeIndex) : getX(points.length - 1);

                return (
                  <svg
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    className="w-full h-full overflow-visible font-mono-code"
                  >
                    <defs>
                      <linearGradient id="gradFEA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="gradFEB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Reference Grid Lines */}
                    {yTicks.map((tick) => {
                      const y = getY(tick);
                      const isPassLine = graphMetric === 'accuracy' && tick === 60;
                      return (
                        <g key={tick}>
                          <line
                            x1={padLeft}
                            y1={y}
                            x2={chartWidth - padRight}
                            y2={y}
                            stroke={isPassLine ? '#F59E0B' : 'currentColor'}
                            strokeOpacity={isPassLine ? 0.6 : 0.08}
                            strokeDasharray={isPassLine ? '4 3' : undefined}
                          />
                          <text
                            x={padLeft - 10}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="9"
                            fill={isPassLine ? '#F59E0B' : 'currentColor'}
                            opacity={isPassLine ? 0.9 : 0.5}
                            fontWeight={isPassLine ? 'bold' : 'normal'}
                          >
                            {tick}
                            {graphMetric === 'accuracy' ? '%' : graphMetric === 'pace' ? 's' : '%'}
                          </text>
                        </g>
                      );
                    })}

                    {/* 60% Passing Benchmark Label */}
                    {passMarkY !== null && (
                      <g transform={`translate(${chartWidth - padRight - 10}, ${passMarkY - 5})`}>
                        <text
                          textAnchor="end"
                          fontSize="9"
                          fontWeight="bold"
                          fill="#F59E0B"
                          opacity="0.85"
                          letterSpacing="0.05em"
                        >
                          60% PASS MARK
                        </text>
                      </g>
                    )}

                    {/* X-axis Date Labels */}
                    {points.map((p, idx) => {
                      if (points.length > 8 && idx % Math.ceil(points.length / 7) !== 0 && idx !== points.length - 1) {
                        return null;
                      }
                      const x = getX(idx);
                      return (
                        <text
                          key={p.id}
                          x={x}
                          y={chartHeight - 10}
                          textAnchor="middle"
                          fontSize="9"
                          fill="currentColor"
                          opacity="0.6"
                        >
                          {p.date}
                        </text>
                      );
                    })}

                    {/* FE-A Area & Curve */}
                    {(graphFilter === 'both' || graphFilter === 'feA') && (
                      <>
                        <path d={areaA} fill="url(#gradFEA)" />
                        <path
                          d={pathA}
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}

                    {/* FE-B Area & Curve */}
                    {(graphFilter === 'both' || graphFilter === 'feB') && (
                      <>
                        <path d={areaB} fill="url(#gradFEB)" />
                        <path
                          d={pathB}
                          fill="none"
                          stroke="#F59E0B"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}

                    {/* Vertical Tracking Cursor for Hovered Node */}
                    {activePoint && (
                      <line
                        x1={activeX}
                        y1={padTop}
                        x2={activeX}
                        y2={padTop + plotHeight}
                        stroke="#9ed67c"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.8"
                      />
                    )}

                    {/* Data Node Dots */}
                    {points.map((p, idx) => {
                      const isHovered = activePoint?.id === p.id;
                      const x = getX(idx);
                      const ptA = ptsA[idx];
                      const ptB = ptsB[idx];

                      return (
                        <g key={p.id}>
                          {/* Subject A Node Dot */}
                          {(graphFilter === 'both' || graphFilter === 'feA') && (
                            <circle
                              cx={x}
                              cy={ptA.y}
                              r={isHovered ? 5.5 : 3.5}
                              fill="#10B981"
                              stroke="#090D16"
                              strokeWidth={isHovered ? 2.5 : 1.5}
                              className="transition-all"
                            />
                          )}

                          {/* Subject B Node Dot */}
                          {(graphFilter === 'both' || graphFilter === 'feB') && (
                            <circle
                              cx={x}
                              cy={ptB.y}
                              r={isHovered ? 5.5 : 3.5}
                              fill="#F59E0B"
                              stroke="#090D16"
                              strokeWidth={isHovered ? 2.5 : 1.5}
                              className="transition-all"
                            />
                          )}

                          {/* Invisible hover capture strip */}
                          <rect
                            x={x - (plotWidth / points.length) / 2}
                            y={padTop}
                            width={plotWidth / points.length}
                            height={plotHeight}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredPoint(p)}
                            onClick={() => setHoveredPoint(p)}
                          />
                        </g>
                      );
                    })}
                  </svg>
                );
              })()}
            </div>

            {/* Interactive Session Inspection Card (Updates on Hover/Click) */}
            {(() => {
              const pt = hoveredPoint || filteredTimeline[filteredTimeline.length - 1] || examTypeStats.timeline[0];
              if (!pt) return null;

              return (
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container/70 p-4 font-mono-code text-xs flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-150">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-primary shrink-0">
                      <span className="material-symbols-outlined text-lg">calendar_clock</span>
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-on-surface font-bold text-sm">
                          {pt.date} • {pt.time}
                        </span>
                        <span className="px-2 py-0.2 rounded bg-surface-container-highest text-[10px] text-tertiary">
                          Session Snapshot
                        </span>
                      </div>
                      <span className="text-on-surface-variant text-[11px]">
                        Recorded at {new Date(pt.timestamp).toLocaleDateString()} {new Date(pt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {/* FE-A Status */}
                    <div className="p-2 rounded-lg bg-surface-container-low border border-mastery-emerald/20">
                      <span className="text-[10px] text-mastery-emerald font-bold block uppercase">
                        Subject A (FE-A)
                      </span>
                      <span className="text-sm font-bold text-on-surface">
                        {pt.feARolling}%
                      </span>
                      <span className="text-[10px] text-on-surface-variant block">
                        {pt.feACount} items • {pt.feAPace}s pace
                      </span>
                    </div>

                    {/* FE-B Status */}
                    <div className="p-2 rounded-lg bg-surface-container-low border border-confidence-amber/20">
                      <span className="text-[10px] text-confidence-amber font-bold block uppercase">
                        Subject B (FE-B)
                      </span>
                      <span className="text-sm font-bold text-on-surface">
                        {pt.feBRolling}%
                      </span>
                      <span className="text-[10px] text-on-surface-variant block">
                        {pt.feBCount} items • {pt.feBPace}s pace
                      </span>
                    </div>

                    {/* Difficulty Gap at Snapshot */}
                    <div className="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                      <span className="text-[10px] text-on-surface-variant uppercase block">
                        Difficulty Gap
                      </span>
                      <span className="text-sm font-bold text-tertiary">
                        &Delta; {Math.abs(Math.round((pt.feARolling - pt.feBRolling) * 10) / 10)}%
                      </span>
                      <span className="text-[10px] text-on-surface-variant block">
                        FE-B is harder
                      </span>
                    </div>

                    {/* Cumulative Velocity */}
                    <div className="p-2 rounded-lg bg-surface-container-low border border-outline-variant/20">
                      <span className="text-[10px] text-on-surface-variant uppercase block">
                        Velocity Delta
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {pt.feBImprovement >= 0 ? `+${pt.feBImprovement}%` : `${pt.feBImprovement}%`}
                      </span>
                      <span className="text-[10px] text-on-surface-variant block">
                        Subject B Progress
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Interactive Date & Time Session History Ledger */}
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-5 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/10">
              <div>
                <h3 className="font-title-sm text-sm font-bold text-on-surface">
                  Temporal Session Progression History
                </h3>
                <p className="font-mono-code text-[11px] text-on-surface-variant">
                  Detailed timeline of accuracy, response latency, and difficulty gap across study sessions.
                </p>
              </div>

              <div className="flex items-center gap-1 font-mono-code text-xs">
                <span className="text-[11px] text-on-surface-variant mr-1">Filter Type:</span>
                <button
                  type="button"
                  onClick={() => setSelectedSessionFilter('all')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer ${
                    selectedSessionFilter === 'all'
                      ? 'bg-primary text-on-primary font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All Sessions
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSessionFilter('feA')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer ${
                    selectedSessionFilter === 'feA'
                      ? 'bg-mastery-emerald text-on-primary font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  FE-A Only
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSessionFilter('feB')}
                  className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer ${
                    selectedSessionFilter === 'feB'
                      ? 'bg-confidence-amber text-on-primary font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  FE-B Only
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-outline-variant/20">
              <table className="w-full text-left font-mono-code text-xs">
                <thead className="bg-surface-container font-label-caps text-on-surface-variant uppercase text-[10px] tracking-wider border-b border-outline-variant/20">
                  <tr>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Time</th>
                    <th className="px-3 py-2.5">Subject A (FE-A)</th>
                    <th className="px-3 py-2.5">Subject B (FE-B)</th>
                    <th className="px-3 py-2.5">Subject B Difficulty Delta</th>
                    <th className="px-3 py-2.5 text-right">Drill Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10 text-on-surface">
                  {filteredTimeline
                    .filter((p) => {
                      if (selectedSessionFilter === 'feA') return p.feACount > 0;
                      if (selectedSessionFilter === 'feB') return p.feBCount > 0;
                      return true;
                    })
                    .map((pt) => {
                      const isHovered = hoveredPoint?.id === pt.id;
                      return (
                        <tr
                          key={pt.id}
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onClick={() => setHoveredPoint(pt)}
                          className={`transition-colors cursor-pointer ${
                            isHovered ? 'bg-surface-container-high' : 'hover:bg-surface-container/40'
                          }`}
                        >
                          <td className="px-3 py-2.5 font-bold text-on-surface">{pt.date}</td>
                          <td className="px-3 py-2.5 text-on-surface-variant">{pt.time}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-bold text-mastery-emerald">{pt.feARolling}%</span>
                            <span className="text-[10px] text-on-surface-variant ml-1.5">
                              ({pt.feACount} Qs • {pt.feAPace}s)
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`font-bold ${
                                pt.feBRolling >= 60 ? 'text-mastery-emerald' : 'text-confidence-amber'
                              }`}
                            >
                              {pt.feBRolling}%
                            </span>
                            <span className="text-[10px] text-on-surface-variant ml-1.5">
                              ({pt.feBCount} Qs • {pt.feBPace}s)
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="px-1.5 py-0.5 rounded bg-surface-container-high border border-outline-variant/20 text-[11px] text-tertiary font-bold">
                              &Delta; {Math.abs(Math.round((pt.feARolling - pt.feBRolling) * 10) / 10)}% gap
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Link
                              to="/quiz/year"
                              className="text-primary hover:underline font-bold inline-flex items-center gap-0.5"
                            >
                              <span>Practice</span>
                              <span className="material-symbols-outlined text-xs">arrow_forward</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Priority Weak Spots Ranked List */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error text-lg">error</span>
            <h2 className="font-title-sm text-base font-bold text-on-surface">
              Curriculum Vulnerabilities (Ranked by Error &amp; Recency)
            </h2>
          </div>
          <span className="font-mono-code text-xs text-on-surface-variant">Leitner Calibrated</span>
        </div>

        {weakSpots.length === 0 ? (
          <p className="text-xs font-mono-code text-on-surface-variant">
            Start practicing exam papers to populate your ranked weakness telemetry.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {weakSpots.map((ws, idx) => (
              <div
                key={ws.topic}
                className="flex items-center justify-between p-4 rounded-xl bg-surface-container border border-outline-variant/20 shadow-sm hover:border-outline-variant/40 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-surface-container-high flex items-center justify-center font-mono-code text-[10px] font-bold text-on-surface">
                      #{idx + 1}
                    </span>
                    <h3 className="font-body-bold text-sm uppercase text-on-surface truncate max-w-[150px]">
                      {ws.topic}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 font-mono-code text-xs">
                    <span
                      className={`font-bold ${
                        ws.status === 'critical'
                          ? 'text-error'
                          : ws.status === 'moderate'
                          ? 'text-confidence-amber'
                          : 'text-mastery-emerald'
                      }`}
                    >
                      {ws.errorRate}% error
                    </span>
                    <span className="text-on-surface-variant/40">•</span>
                    <span className="text-on-surface-variant">
                      {ws.incorrectAttempts}/{ws.totalAttempts} failed
                    </span>
                  </div>
                </div>

                <Link
                  to={`/quiz/topic?topic=${encodeURIComponent(ws.topic)}`}
                  className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center gap-1 transition-all"
                >
                  <span>Drill</span>
                  <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2D Topic Heatmap Matrix */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-title-sm text-base font-bold text-on-surface">
              Topic Weakness Heatmap Matrix
            </h2>
            <p className="font-mono-code text-xs text-on-surface-variant mt-0.5">
              Error trajectory across all 29 domains over time periods.
            </p>
          </div>

          {/* Interval Selector */}
          <div className="inline-flex rounded-xl bg-surface-container p-1 border border-outline-variant/30 font-mono-code text-xs">
            {(['day', 'week', 'month'] as const).map((inter) => (
              <button
                key={inter}
                onClick={() => setHeatmapInterval(inter)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-all cursor-pointer ${
                  heatmapInterval === inter
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {inter}ly
              </button>
            ))}
          </div>
        </div>

        {/* Heatmap Legend */}
        <div className="flex flex-wrap items-center gap-4 font-mono-code text-xs text-on-surface-variant pt-1">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-surface-container border border-outline-variant/40" />
            No attempts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-mastery-emerald/30 border border-mastery-emerald/50" />
            Strong (&lt;25% err)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-confidence-amber/30 border border-confidence-amber/50" />
            Moderate (25-49% err)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded bg-error/30 border border-error/50" />
            Weak (&gt;50% err)
          </span>
        </div>

        {/* Heatmap Grid Table */}
        <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3">
          <table className="min-w-full font-mono-code text-xs">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="sticky left-0 bg-surface-container-lowest px-3 py-2 text-left font-label-caps text-on-surface-variant z-10 w-48 uppercase">
                  Domain
                </th>
                {heatmapData?.periods?.map((p: string) => (
                  <th key={p} className="px-3 py-2 text-center text-on-surface-variant font-semibold min-w-[70px]">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-on-surface">
              {heatmapData &&
                Object.entries(heatmapData.matrix).map(([topic, cells]: any) => (
                  <tr key={topic} className="hover:bg-surface-container/50">
                    <td className="sticky left-0 bg-surface-container-lowest px-3 py-2 font-bold uppercase z-10 truncate max-w-[190px]">
                      {topic}
                    </td>
                    {cells.map((cell: any, i: number) => {
                      let cellStyle = 'bg-surface-container-low text-on-surface-variant/40 border-outline-variant/20';
                      if (cell.attemptCount > 0) {
                        if (cell.errorRate >= 50) {
                          cellStyle = 'bg-error/20 text-error border-error/40 font-bold';
                        } else if (cell.errorRate >= 25) {
                          cellStyle = 'bg-confidence-amber/20 text-confidence-amber border-confidence-amber/40 font-bold';
                        } else {
                          cellStyle = 'bg-mastery-emerald/20 text-mastery-emerald border-mastery-emerald/40 font-bold';
                        }
                      }
                      return (
                        <td key={i} className="p-1 text-center">
                          <div
                            title={`Period: ${cell.period}\nAttempts: ${cell.attemptCount}\nError Rate: ${
                              cell.errorRate !== null ? `${cell.errorRate}%` : 'N/A'
                            }\nAvg Time: ${cell.avgTimeSec}s`}
                            className={`rounded px-1.5 py-1 text-[11px] border transition-transform hover:scale-105 ${cellStyle}`}
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

      {/* Confidence Calibration Analysis */}
      {calibration?.hasData && (
        <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-confidence-amber text-lg">grade</span>
            <h2 className="font-title-sm text-base font-bold text-on-surface">
              Pre-Reveal Confidence vs Observed Reality
            </h2>
          </div>
          <p className="font-mono-code text-xs text-on-surface-variant">
            Comparing stated pre-answer certainty against observed correctness. Perfect calibration occurs when your actual accuracy matches your stated probability.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-1">
            {calibration.bins.map((bin: any) => {
              const isOver = bin.actualAccuracy < bin.expectedAccuracy && bin.totalAttempts > 0;
              return (
                <div
                  key={bin.confidenceLevel}
                  className="rounded-xl border border-outline-variant/20 bg-surface-container p-4 flex flex-col gap-1 text-center font-mono-code"
                >
                  <span className="text-xs font-bold text-confidence-amber uppercase">{bin.label}</span>
                  <div className="space-y-0.5 mt-1">
                    <p className="text-[11px] text-on-surface-variant">
                      Target: <strong className="text-on-surface">{bin.expectedAccuracy}%</strong>
                    </p>
                    <p className="text-xl font-extrabold text-primary">
                      {bin.totalAttempts > 0 ? `${bin.actualAccuracy}%` : '—'}
                    </p>
                    <p className="text-[10px] text-on-surface-variant/70">
                      ({bin.correctAttempts}/{bin.totalAttempts} verified)
                    </p>
                  </div>
                  {bin.totalAttempts > 0 && (
                    <div
                      className={`text-[10px] font-bold rounded px-1.5 py-0.5 mt-1 inline-block ${
                        isOver ? 'bg-error/20 text-error' : 'bg-mastery-emerald/20 text-mastery-emerald'
                      }`}
                    >
                      {bin.gap >= 0 ? `+${bin.gap}% accurate` : `${bin.gap}% gap`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sortable TanStack Table: All Topics */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-title-sm text-base font-bold text-on-surface">
              Topic Performance Ledger
            </h2>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Sort by column headers to analyze error rate velocity and attempt durations.
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-2 text-on-surface-variant text-[16px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search domains..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container pl-9 pr-4 py-1.5 text-xs font-mono-code text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
          <table className="w-full text-left font-mono-code text-xs">
            <thead className="bg-surface-container font-label-caps text-on-surface-variant uppercase border-b border-outline-variant/20">
              <tr>
                <th onClick={() => handleSort('topic')} className="px-4 py-3 cursor-pointer hover:text-on-surface">
                  Topic Domain
                </th>
                <th onClick={() => handleSort('errorRate')} className="px-4 py-3 cursor-pointer hover:text-on-surface">
                  Error Rate
                </th>
                <th onClick={() => handleSort('totalAttempts')} className="px-4 py-3 cursor-pointer hover:text-on-surface">
                  Total Reps
                </th>
                <th onClick={() => handleSort('avgTimeSeconds')} className="px-4 py-3 cursor-pointer hover:text-on-surface">
                  Avg Time
                </th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-on-surface">
              {sortedTableData.map((row) => (
                <tr key={row.topic} className="hover:bg-surface-container/40 transition-colors">
                  <td className="px-4 py-3 font-bold uppercase text-primary">{row.topic}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-bold ${
                        row.errorRate >= 50
                          ? 'text-error'
                          : row.errorRate >= 25
                          ? 'text-confidence-amber'
                          : 'text-mastery-emerald'
                      }`}
                    >
                      {row.errorRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{row.totalAttempts}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{row.avgTimeSeconds?.toFixed(1) || '0'}s</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/quiz/topic?topic=${encodeURIComponent(row.topic)}`}
                      className="text-primary hover:underline font-bold"
                    >
                      Practice →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Attempts Audit Log (links to /history/:id) */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">history</span>
              <h2 className="font-title-sm text-base font-bold text-on-surface">
                Recent Attempt Audit Trail
              </h2>
            </div>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Chronological log of recent question trials. Click any question ID to inspect item telemetry and retry.
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-high border border-outline-variant/30 text-xs font-mono-code text-on-surface hover:text-primary hover:border-primary/40 transition-all"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            <span>Export CSV</span>
          </button>
        </div>

        {recentAttempts.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant font-mono-code text-xs border border-dashed border-outline-variant/30 rounded-xl">
            No attempts logged yet. Complete a quiz to view cognitive telemetry logs.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
            <table className="w-full text-left font-mono-code text-xs">
              <thead className="bg-surface-container font-label-caps text-on-surface-variant uppercase border-b border-outline-variant/20">
                <tr>
                  <th className="px-4 py-3">Question ID</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Choice</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Latency</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10 text-on-surface">
                {recentAttempts.map((att, i) => (
                  <tr key={att.id || i} className="hover:bg-surface-container/40 transition-colors group">
                    <td className="px-4 py-3 font-bold text-on-surface">
                      <Link
                        to={`/history/${encodeURIComponent(att.questionId)}`}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        #{att.questionId}
                        <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 transition-opacity">
                          open_in_new
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant capitalize">{att.topic}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant/30 font-bold uppercase">
                        {att.selectedAnswer}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[11px] ${
                          att.isCorrect
                            ? 'bg-mastery-emerald/15 text-mastery-emerald'
                            : 'bg-error/15 text-error'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            att.isCorrect ? 'bg-mastery-emerald' : 'bg-error'
                          }`}
                        />
                        {att.isCorrect ? 'Passed' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{att.timeSeconds?.toFixed(1) || '0'}s</td>
                    <td className="px-4 py-3 text-confidence-amber">
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-amber-400 text-xs">star</span>
                        <span>Level {att.confidence || 3}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/history/${encodeURIComponent(att.questionId)}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline font-bold"
                      >
                        <span>Audit</span>
                        <span className="material-symbols-outlined text-xs">chevron_right</span>
                      </Link>
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

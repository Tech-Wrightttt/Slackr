import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { db } from '../db';
import type { SRScheduleRecord, AttemptRecord } from '../db/schema';
import { useStore } from '../store/useStore';

export const Home: React.FC = () => {
  const { theme } = useStore();
  const [meta, setMeta] = useState<any>(null);
  const [totalAttempts, setTotalAttempts] = useState<number>(0);
  const [todayAttempts, setTodayAttempts] = useState<number>(0);
  const [overallAccuracy, setOverallAccuracy] = useState<number>(0);
  const [avgTimeSeconds, setAvgTimeSeconds] = useState<number>(0);
  const [dueReviews, setDueReviews] = useState<SRScheduleRecord[]>([]);
  const [criticalFailCount, setCriticalFailCount] = useState<number>(0);
  const [topWeakSpots, setTopWeakSpots] = useState<any[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<AttemptRecord[]>([]);
  const [weeklyCounts, setWeeklyCounts] = useState<number[]>([12, 28, 45, 19, 58, 64, 32]);
  const [napActive, setNapActive] = useState<boolean>(false);
  const [napMinutes, setNapMinutes] = useState<number>(15);

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

          const totalTime = attempts.reduce((acc, a) => acc + (a.timeSeconds || 0), 0);
          setAvgTimeSeconds(Math.round(totalTime / attempts.length));

          // Filter attempts for today
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          const today = attempts.filter((a) => new Date(a.timestamp) >= startOfToday).length;
          setTodayAttempts(today);

          // Get last 5 attempts
          const sorted = [...attempts].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setRecentAttempts(sorted.slice(0, 5));

          // Calculate attempts past 7 days
          const days = [0, 0, 0, 0, 0, 0, 0];
          const now = Date.now();
          attempts.forEach((a) => {
            const diffDays = Math.floor((now - new Date(a.timestamp).getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays >= 0 && diffDays < 7) {
              days[6 - diffDays]++;
            }
          });
          // Only override if there is real data
          if (days.some((d) => d > 0)) {
            setWeeklyCounts(days);
          }
        }

        const due = await StatsDbService.getDueReviews();
        setDueReviews(due);

        // Count critical fail (repetition 0 or high error)
        const critical = due.filter((d) => d.repetitionNumber === 0).length;
        setCriticalFailCount(critical);

        const weak = await AnalyticsEngine.getPriorityWeakSpots();
        setTopWeakSpots(weak.slice(0, 3));
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    };

    loadDashboardData();
  }, []);

  const handleExportCSV = async () => {
    try {
      const attempts = await db.attempts.toArray();
      if (attempts.length === 0) {
        alert('No attempts recorded yet to export.');
        return;
      }
      const headers = ['Session ID', 'Question ID', 'Topic', 'Selected Answer', 'Is Correct', 'Time (s)', 'Confidence', 'Timestamp'];
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
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `slackr_telemetry_attempts_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('CSV export failed:', e);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  };

  // Generate sparkline polygon points based on weeklyCounts
  const maxWeekly = Math.max(...weeklyCounts, 10);
  const sparkPoints = weeklyCounts.map((val, idx) => {
    const x = 10 + idx * 45;
    const y = 90 - Math.round((val / maxWeekly) * 70);
    return { x, y, val };
  });
  const polylineStr = sparkPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const polygonStr = `10,95 ${polylineStr} ${sparkPoints[sparkPoints.length - 1].x},95`;

  return (
    <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 animate-in fade-in duration-300">
      {/* Subtle ambient aura backdrop */}
      <div className="absolute -top-12 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-80 h-80 bg-interactive-sky/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Editorial Header & Actions */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="flex flex-col gap-2 max-w-2xl">
          <div className="flex items-center gap-2 font-label-caps text-xs text-primary tracking-widest uppercase">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>Engine Status // Telemetry Online</span>
            <span className="text-on-surface-variant/40">/</span>
            <span className="text-on-surface-variant">Dexie.js Offline Cache</span>
          </div>
          <h1 className="font-display-lg text-4xl sm:text-5xl font-extrabold text-on-surface tracking-tight leading-none">
            Master the{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-on-surface via-primary to-primary-fixed-dim">
              PHILNITS
            </span>{' '}
            Exam.
          </h1>
          <p className="font-body-stem text-base text-on-surface-variant pt-1 leading-relaxed">
            Precision telemetry for Fundamental Engineer (FE) and Applied Information Technology Engineer (AP)
            tracks. Calibrated spacing, zero latency, local persistence.
          </p>
        </div>

        {/* Action Cluster */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <Link
            to="/quiz/year"
            className="group relative px-6 py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary transition-all duration-200 shadow-lg shadow-primary-container/20 active:scale-[0.98] flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-primary-fixed text-lg transition-transform group-hover:translate-x-0.5">
              play_arrow
            </span>
            <span className="font-body-bold text-sm tracking-wide">Start Year Paper</span>
            <span className="font-label-caps text-[10px] uppercase bg-black/30 px-1.5 py-0.5 rounded text-primary-fixed font-mono-code">
              2024 FE
            </span>
          </Link>

          <Link
            to="/quiz/srs"
            className="px-5 py-3 rounded-xl bg-surface-container-low hover:bg-surface-container hover:text-on-surface transition-all duration-200 active:scale-[0.98] flex items-center gap-2 text-on-surface-variant shadow-sm border border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-confidence-amber text-lg">schedule</span>
            <span className="font-body-bold text-sm">Review Due</span>
            <span className="px-2 py-0.5 rounded-full bg-confidence-amber/15 text-confidence-amber font-mono-timer text-xs font-bold">
              {dueReviews.length}
            </span>
          </Link>

          <Link
            to="/settings"
            aria-label="Quick Session Settings"
            className="w-11 h-11 rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all shadow-sm border border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-lg">tune</span>
          </Link>
        </div>
      </section>

      {/* Study Companion Banner */}
      <section className="w-full rounded-xl bg-surface-container-low border border-outline-variant/30 p-4 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden shadow-md">
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-surface-container-high/80 border border-outline-variant/30 p-2 shrink-0 flex items-center justify-center shadow-inner">
            <img
              src={theme === 'dark' ? '/koala-mascot.png' : '/koala-mascot-light.png'}
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/slackr-logo.svg';
              }}
              alt="Slackr Koala Study Companion"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-label-caps text-xs text-primary uppercase tracking-wider">Study Companion</span>
              <span className="w-2 h-2 rounded-full bg-mastery-emerald inline-block" />
              <span className="font-mono-timer text-xs text-confidence-amber font-bold">14D STREAK</span>
            </div>
            <h2 className="font-title-sm text-lg font-bold text-on-surface">
              Slackr Koala: Resting between sprint reps
            </h2>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Pencil ready, spaced repetition queue synchronized • Keep pace for the next{' '}
              {dueReviews.length > 0 ? dueReviews.length : '42'} items
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 relative z-10">
          <button
            type="button"
            onClick={() => setNapActive(!napActive)}
            className="px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary font-mono-code text-xs font-semibold flex items-center gap-1.5 transition-all border border-outline-variant/20"
          >
            <span className="material-symbols-outlined text-[15px]">hotel</span>
            <span>{napActive ? `Nap Mode Active (${napMinutes}m)` : 'Nap Timer: 15m'}</span>
          </button>
          <Link
            to="/quiz/srs"
            className="px-4 py-2 rounded-lg bg-primary-container hover:bg-primary text-on-primary font-mono-code text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <span className="material-symbols-outlined text-[15px]">play_arrow</span>
            <span>Resume Reps</span>
          </Link>
        </div>
      </section>

      {/* KPI Metric Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Item Bank */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md border border-outline-variant/20 transition-all hover:bg-surface-container">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Item Bank</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[16px]">library_books</span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-headline-md text-3xl font-extrabold text-on-surface tracking-tight">
              {meta?.total_questions?.toLocaleString() || '3,609'}
            </span>
            <span className="font-label-caps text-primary text-[10px]">VERIFIED</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-on-surface-variant font-mono-code text-xs">
            <span>AP: 1,420 Items</span>
            <span>FE: 2,189 Items</span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-2 overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: '100%' }} />
          </div>
        </div>

        {/* KPI 2: Attempts Logged */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md border border-outline-variant/20 transition-all hover:bg-surface-container">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Attempts Logged</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-interactive-sky">
              <span className="material-symbols-outlined text-[16px]">history_edu</span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-headline-md text-3xl font-extrabold text-on-surface tracking-tight">
              {totalAttempts.toLocaleString()}
            </span>
            <span className="font-mono-code text-xs text-interactive-sky">
              {todayAttempts > 0 ? `+${todayAttempts} today` : '+64 recent'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-on-surface-variant font-mono-code text-xs">
            <span>Avg Time / Item</span>
            <span className="text-on-surface">{avgTimeSeconds > 0 ? formatSeconds(avgTimeSeconds) : '1m 48s'}</span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-2 overflow-hidden">
            <div className="bg-interactive-sky h-full rounded-full" style={{ width: `${Math.min(100, Math.max(15, (totalAttempts / 500) * 100))}%` }} />
          </div>
        </div>

        {/* KPI 3: Overall Accuracy */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md border border-outline-variant/20 transition-all hover:bg-surface-container">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">Overall Accuracy</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-mastery-emerald">
              <span className="material-symbols-outlined text-[16px]">verified</span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-headline-md text-3xl font-extrabold text-on-surface tracking-tight">
              {totalAttempts > 0 ? `${overallAccuracy}%` : '78.4%'}
            </span>
            <span className="font-mono-code text-xs text-mastery-emerald">Passing ≥60%</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-on-surface-variant font-mono-code text-xs">
            <span>Target Score</span>
            <span className="text-on-surface">85.0%</span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-mastery-emerald h-full rounded-full"
              style={{ width: `${totalAttempts > 0 ? overallAccuracy : 78.4}%` }}
            />
          </div>
        </div>

        {/* KPI 4: SRS Due Deck */}
        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md border border-outline-variant/20 transition-all hover:bg-surface-container">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">SRS Due Deck</span>
            <span className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-confidence-amber">
              <span className="material-symbols-outlined text-[16px]">bolt</span>
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-headline-md text-3xl font-extrabold text-confidence-amber tracking-tight">
              {dueReviews.length}
            </span>
            <span className="font-label-caps text-on-surface-variant text-[10px]">CARDS READY</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-on-surface-variant font-mono-code text-xs">
            <span>Critical Fail (L0)</span>
            <span className="text-error">{criticalFailCount > 0 ? `${criticalFailCount} items` : '14 items'}</span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-2 overflow-hidden">
            <div className="bg-confidence-amber h-full rounded-full" style={{ width: '65%' }} />
          </div>
        </div>
      </section>

      {/* Visual Anchor / Telemetry Sparkline & Priority Weak Spots */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Priority Weak Spots Banner (8 cols) */}
        <div className="lg:col-span-8 rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md border border-outline-variant/20 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-error animate-ping" />
              <h2 className="font-title-sm text-lg font-bold text-on-surface">Target Calibration // Critical Weak Spots</h2>
            </div>
            <span className="font-mono-code text-xs text-on-surface-variant">
              Based on {totalAttempts > 0 ? `${totalAttempts} logged attempts` : 'last 320 attempts'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-2">
            {topWeakSpots.length > 0 ? (
              topWeakSpots.map((ws, index) => {
                const colorClass = index === 0 ? 'text-error' : index === 1 ? 'text-confidence-amber' : 'text-interactive-sky';
                const bgBarClass = index === 0 ? 'bg-error' : index === 1 ? 'bg-confidence-amber' : 'bg-interactive-sky';
                return (
                  <div
                    key={ws.topic}
                    className="bg-surface-container rounded-lg p-4 flex flex-col justify-between hover:bg-surface-container-high transition-colors shadow-sm border border-outline-variant/20"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className={`font-label-caps text-xs ${colorClass} uppercase truncate max-w-[140px]`}>
                        {ws.topic}
                      </span>
                      <span className={`font-mono-timer text-xs ${colorClass} font-bold`}>
                        {ws.errorRate}%
                      </span>
                    </div>
                    <div className="my-3">
                      <div className="font-body-bold text-sm text-on-surface capitalize line-clamp-1">{ws.topic}</div>
                      <div className="font-mono-code text-xs text-on-surface-variant pt-0.5">
                        {ws.incorrectAttempts} error / {ws.totalAttempts} reps
                      </div>
                    </div>
                    <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mb-3">
                      <div className={`${bgBarClass} h-full rounded-full`} style={{ width: `${ws.errorRate}%` }} />
                    </div>
                    <Link
                      to={`/quiz/topic?topic=${encodeURIComponent(ws.topic)}`}
                      className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                    >
                      <span>Drill Topic</span>
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </Link>
                  </div>
                );
              })
            ) : (
              <>
                {/* Fallback baseline weak spots if zero attempts yet */}
                <div className="bg-surface-container rounded-lg p-4 flex flex-col justify-between hover:bg-surface-container-high transition-colors shadow-sm border border-outline-variant/20">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-label-caps text-xs text-error">NETWORKS</span>
                    <span className="font-mono-timer text-xs text-error font-bold">48%</span>
                  </div>
                  <div className="my-3">
                    <div className="font-body-bold text-sm text-on-surface line-clamp-1">Computer Networks</div>
                    <div className="font-mono-code text-xs text-on-surface-variant pt-0.5">OSI, Subnets, TLS 1.3</div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mb-3">
                    <div className="bg-error h-full rounded-full" style={{ width: '48%' }} />
                  </div>
                  <Link
                    to="/quiz/topic?topic=network"
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Drill 15 Items</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>

                <div className="bg-surface-container rounded-lg p-4 flex flex-col justify-between hover:bg-surface-container-high transition-colors shadow-sm border border-outline-variant/20">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-label-caps text-xs text-confidence-amber">SYSTEM ARCH</span>
                    <span className="font-mono-timer text-xs text-confidence-amber font-bold">54%</span>
                  </div>
                  <div className="my-3">
                    <div className="font-body-bold text-sm text-on-surface line-clamp-1">Computer Architecture</div>
                    <div className="font-mono-code text-xs text-on-surface-variant pt-0.5">Pipelines, Cache Coherency</div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mb-3">
                    <div className="bg-confidence-amber h-full rounded-full" style={{ width: '54%' }} />
                  </div>
                  <Link
                    to="/quiz/topic?topic=architecture"
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Drill 12 Items</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>

                <div className="bg-surface-container rounded-lg p-4 flex flex-col justify-between hover:bg-surface-container-high transition-colors shadow-sm border border-outline-variant/20">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-label-caps text-xs text-interactive-sky">ALGO / STRUCT</span>
                    <span className="font-mono-timer text-xs text-interactive-sky font-bold">59%</span>
                  </div>
                  <div className="my-3">
                    <div className="font-body-bold text-sm text-on-surface line-clamp-1">Data Structures</div>
                    <div className="font-mono-code text-xs text-on-surface-variant pt-0.5">AVL Trees, Hash Tables</div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden mb-3">
                    <div className="bg-interactive-sky h-full rounded-full" style={{ width: '59%' }} />
                  </div>
                  <Link
                    to="/quiz/topic?topic=algorithms"
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Drill 10 Items</span>
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
              </>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between font-mono-code text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-primary">verified_user</span>
              Automated Leitner queue reshuffles on failure
            </span>
            <Link to="/analytics" className="text-primary hover:underline flex items-center gap-1">
              <span>Inspect Syllabus Heatmap</span>
              <span className="material-symbols-outlined text-[14px]">east</span>
            </Link>
          </div>
        </div>

        {/* Telemetry Vector Graphic Card (4 cols) */}
        <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md border border-outline-variant/20">
          <div className="flex items-center justify-between">
            <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
              7-Day Retention Velocity
            </span>
            <span className="font-mono-code text-xs text-primary font-bold">+4.2%</span>
          </div>

          {/* Inline SVG Performance Spark-Chart */}
          <div className="my-4 py-2">
            <svg className="w-full h-28 overflow-visible text-primary" fill="none" viewBox="0 0 300 100">
              <defs>
                <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#9ed67c" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#9ed67c" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Gridlines */}
              <line stroke="var(--color-surface-container-highest)" strokeDasharray="2 4" strokeWidth="1" x1="0" x2="300" y1="20" y2="20" />
              <line stroke="var(--color-surface-container-highest)" strokeDasharray="2 4" strokeWidth="1" x1="0" x2="300" y1="50" y2="50" />
              <line stroke="var(--color-surface-container-highest)" strokeDasharray="2 4" strokeWidth="1" x1="0" x2="300" y1="80" y2="80" />
              {/* Area Fill */}
              <polygon fill="url(#areaGradient)" points={polygonStr} />
              {/* Path Line */}
              <polyline
                fill="none"
                points={polylineStr}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              {/* Data Dots */}
              {sparkPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  fill="var(--color-surface-container-lowest)"
                  r={i === sparkPoints.length - 1 ? 4.5 : 3.5}
                  stroke="#9ed67c"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-between font-mono-code text-xs text-on-surface-variant pt-1 border-t-0">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span className="text-primary font-bold">Today</span>
          </div>
        </div>
      </section>

      {/* 4 Core Review Modes Grid */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-label-caps text-xs text-primary uppercase tracking-widest">Architected Protocols</span>
            <h2 className="font-title-sm text-xl font-bold text-on-surface">Core Review Execution Modes</h2>
          </div>
          <span className="font-mono-code text-xs text-on-surface-variant hidden sm:inline">Select test regimen</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Mode 1: Exam Year */}
          <Link
            to="/quiz/year"
            className="group rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md transition-all hover:bg-surface-container border border-outline-variant/20 relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <span className="w-10 h-10 rounded-xl bg-surface-container-high group-hover:bg-primary-container text-on-surface group-hover:text-primary-fixed flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[20px]">calendar_month</span>
              </span>
              <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                2007-2026
              </span>
            </div>
            <div className="my-4">
              <h3 className="font-title-sm text-base font-bold text-on-surface group-hover:text-primary transition-colors">
                By Exam Year
              </h3>
              <p className="font-body-base text-sm text-on-surface-variant mt-1 leading-relaxed">
                Standard 80-question continuous timed simulation mimicking the strict PhilNITS Morning Session test
                environment.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between text-on-surface-variant group-hover:text-on-surface font-mono-code text-xs">
              <span>{meta?.years?.length || 19} Exam Years</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                east
              </span>
            </div>
          </Link>

          {/* Mode 2: Topic Category */}
          <Link
            to="/quiz/topic"
            className="group rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md transition-all hover:bg-surface-container border border-outline-variant/20 relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <span className="w-10 h-10 rounded-xl bg-surface-container-high group-hover:bg-interactive-sky text-on-surface group-hover:text-surface-container-lowest flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[20px]">category</span>
              </span>
              <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                29 Domains
              </span>
            </div>
            <div className="my-4">
              <h3 className="font-title-sm text-base font-bold text-on-surface group-hover:text-interactive-sky transition-colors">
                By Topic Category
              </h3>
              <p className="font-body-base text-sm text-on-surface-variant mt-1 leading-relaxed">
                Isolate discrete curriculum units: Discrete Math, Computer Systems, Software Development, Databases,
                and Security.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between text-on-surface-variant group-hover:text-on-surface font-mono-code text-xs">
              <span>Detailed Mastery Breakdown</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                east
              </span>
            </div>
          </Link>

          {/* Mode 3: Combined Filters */}
          <Link
            to="/quiz/combined"
            className="group rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md transition-all hover:bg-surface-container border border-outline-variant/20 relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <span className="w-10 h-10 rounded-xl bg-surface-container-high group-hover:bg-confidence-amber text-on-surface group-hover:text-surface-container-lowest flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[20px]">filter_alt</span>
              </span>
              <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                Matrix
              </span>
            </div>
            <div className="my-4">
              <h3 className="font-title-sm text-base font-bold text-on-surface group-hover:text-confidence-amber transition-colors">
                Combined Filters
              </h3>
              <p className="font-body-base text-sm text-on-surface-variant mt-1 leading-relaxed">
                Intersect difficulty tiers, question flags, and unattempted sets with multi-year temporal cross-sections.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between text-on-surface-variant group-hover:text-on-surface font-mono-code text-xs">
              <span>Precision Query Engine</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                east
              </span>
            </div>
          </Link>

          {/* Mode 4: Custom Builder */}
          <Link
            to="/quiz/custom"
            className="group rounded-xl bg-surface-container-low p-6 flex flex-col justify-between shadow-md transition-all hover:bg-surface-container border border-outline-variant/20 relative overflow-hidden"
          >
            <div className="flex items-start justify-between">
              <span className="w-10 h-10 rounded-xl bg-surface-container-high group-hover:bg-badge-indigo text-on-surface group-hover:text-white flex items-center justify-center transition-colors">
                <span className="material-symbols-outlined text-[20px]">architecture</span>
              </span>
              <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant">
                Bespoke
              </span>
            </div>
            <div className="my-4">
              <h3 className="font-title-sm text-base font-bold text-on-surface group-hover:text-badge-indigo transition-colors">
                Custom Builder
              </h3>
              <p className="font-body-base text-sm text-on-surface-variant mt-1 leading-relaxed">
                Assemble specialized sprint sets: 20-minute rapid bursts, math-only calculations, or diagram intensive
                schematics.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between text-on-surface-variant group-hover:text-on-surface font-mono-code text-xs">
              <span>Dynamic Question Staging</span>
              <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                east
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Recent Activity Table & Exam Blueprint Visualizer */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Activity Table (8 cols) */}
        <div className="lg:col-span-8 rounded-xl bg-surface-container-low p-6 shadow-md border border-outline-variant/20 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-lg">history</span>
              <h2 className="font-title-sm text-lg font-bold text-on-surface">Telemetry Audit // Recent Attempts</h2>
            </div>
            <button
              onClick={handleExportCSV}
              className="font-mono-code text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <span>Export CSV</span>
              <span className="material-symbols-outlined text-xs">download</span>
            </button>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-left font-mono-code text-xs">
              <thead>
                <tr className="text-on-surface-variant font-label-caps text-label-caps uppercase bg-surface-container/50">
                  <th className="py-2.5 px-3 rounded-l-lg">Session ID</th>
                  <th className="py-2.5 px-3">Curriculum Focus</th>
                  <th className="py-2.5 px-3">Selected</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3 rounded-r-lg text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y-0 text-on-surface">
                {recentAttempts.length > 0 ? (
                  recentAttempts.map((att, i) => (
                    <tr key={att.id || i} className="hover:bg-surface-container transition-colors group">
                      <td className="py-3 px-3 font-bold text-on-surface">
                        <Link
                          to={`/history/${encodeURIComponent(att.questionId)}`}
                          className="text-primary hover:underline inline-flex items-center gap-1 font-mono-code"
                        >
                          #{att.questionId}
                          <span className="material-symbols-outlined text-[12px] opacity-0 group-hover:opacity-100 transition-opacity">
                            open_in_new
                          </span>
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-on-surface-variant capitalize">{att.topic}</td>
                      <td className="py-3 px-3 uppercase font-bold text-primary">{att.selectedAnswer}</td>
                      <td className="py-3 px-3 text-on-surface-variant">{att.timeSeconds?.toFixed(1)}s</td>
                      <td className="py-3 px-3 text-confidence-amber">Level {att.confidence || 3}</td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
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
                          {att.isCorrect ? 'Passed' : 'Review'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    {/* Default exemplary records matching mockup */}
                    <tr className="hover:bg-surface-container transition-colors group">
                      <td className="py-3 px-3 font-bold text-on-surface">#FE-2024-S02</td>
                      <td className="py-3 px-3 text-on-surface-variant">Full Year Morning 2024</td>
                      <td className="py-3 px-3">80/80</td>
                      <td className="py-3 px-3 text-on-surface-variant">1h 42m</td>
                      <td className="py-3 px-3 text-confidence-amber">Level 4</td>
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mastery-emerald/15 text-mastery-emerald font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-mastery-emerald" />
                          Passed
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container transition-colors group">
                      <td className="py-3 px-3 font-bold text-on-surface">#SRS-REV-094</td>
                      <td className="py-3 px-3 text-on-surface-variant">SRS Leitner Level 3 Queue</td>
                      <td className="py-3 px-3">30/30</td>
                      <td className="py-3 px-3 text-on-surface-variant">24m 10s</td>
                      <td className="py-3 px-3 text-confidence-amber">Level 5</td>
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mastery-emerald/15 text-mastery-emerald font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-mastery-emerald" />
                          Passed
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container transition-colors group">
                      <td className="py-3 px-3 font-bold text-on-surface">#DRILL-NET-11</td>
                      <td className="py-3 px-3 text-on-surface-variant">Computer Networks (OSI &amp; TCP)</td>
                      <td className="py-3 px-3">25/25</td>
                      <td className="py-3 px-3 text-on-surface-variant">31m 05s</td>
                      <td className="py-3 px-3 text-confidence-amber">Level 2</td>
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/15 text-error font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-error" />
                          Review
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container transition-colors group">
                      <td className="py-3 px-3 font-bold text-on-surface">#CUST-SYS-44</td>
                      <td className="py-3 px-3 text-on-surface-variant">Logic Circuits &amp; Boolean Algebra</td>
                      <td className="py-3 px-3">15/15</td>
                      <td className="py-3 px-3 text-on-surface-variant">12m 40s</td>
                      <td className="py-3 px-3 text-confidence-amber">Level 4</td>
                      <td className="py-3 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-interactive-sky/15 text-interactive-sky font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-interactive-sky" />
                          Mastered
                        </span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Syllabus Architecture & Telemetry Card (4 cols) */}
        <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-6 shadow-md border border-outline-variant/20 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-title-sm text-lg font-bold text-on-surface">Official Syllabus Scope</h2>
            <span className="font-label-caps text-xs text-primary uppercase">IPA Standard</span>
          </div>

          <div className="relative w-full h-40 rounded-xl overflow-hidden bg-surface-container flex items-center justify-center border border-outline-variant/20">
            {/* Dark circuit blueprint graphics */}
            <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-transparent z-10" />
            <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#396a1e_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="flex flex-col items-center justify-center text-center p-4 relative z-10">
              <span className="material-symbols-outlined text-4xl text-primary mb-1">memory</span>
              <span className="font-mono-code text-xs text-on-surface font-bold">PHILNITS FE / AP Framework</span>
              <span className="font-mono-code text-[11px] text-on-surface-variant">CBT Accredited Standard</span>
            </div>
            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between font-mono-code text-xs z-20">
              <span className="text-on-surface font-semibold">Morning Session: 80 Items</span>
              <span className="text-primary font-bold">150 Minutes</span>
            </div>
          </div>

          {/* Curated Topic Stack */}
          <div className="flex flex-col gap-1.5 font-mono-code text-xs">
            <div className="flex items-center justify-between py-2 px-3 rounded bg-surface-container border border-outline-variant/10">
              <span className="text-on-surface-variant">1. Technology Architecture</span>
              <span className="text-on-surface font-semibold">45 Questions</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded bg-surface-container border border-outline-variant/10">
              <span className="text-on-surface-variant">2. Management Systems</span>
              <span className="text-on-surface font-semibold">15 Questions</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded bg-surface-container border border-outline-variant/10">
              <span className="text-on-surface-variant">3. Strategy &amp; Governance</span>
              <span className="text-on-surface font-semibold">20 Questions</span>
            </div>
          </div>

          {/* Quick Launch Diagnostic Button */}
          <Link
            to="/analytics"
            className="w-full py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-body-bold text-xs flex items-center justify-center gap-2 transition-all border border-outline-variant/20 shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">assessment</span>
            <span>Generate Diagnostic Report</span>
          </Link>
        </div>
      </section>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { db } from '../db';
import type { SRScheduleRecord, AttemptRecord } from '../db/schema';
import { CountUp } from '../components/reactbits';

export const Home: React.FC = () => {
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
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6 animate-in fade-in duration-200">
      {/* Minimalist Editorial Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3.5">
          <img
            src="/SlackrLogo.png"
            alt="Slackr Logo"
            className="w-11 h-11 object-contain rounded-xl p-1 bg-surface-container-high border border-outline-variant/30 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-primary" />
              <span className="font-mono-code text-xs text-on-surface-variant font-medium uppercase tracking-wider">
                PHILNITS FE / AP Engine
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
              Dashboard
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <Link
            to="/quiz/year"
            className="flex-1 sm:flex-initial min-h-[40px] px-4 py-2 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-semibold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            <span>Start Year Paper</span>
          </Link>

          <Link
            to="/quiz/srs"
            className="flex-1 sm:flex-initial min-h-[40px] px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 border border-outline-variant/30"
          >
            <span className="material-symbols-outlined text-confidence-amber text-[16px]">schedule</span>
            <span>Review Due</span>
            <span className="px-1.5 py-0.2 rounded-full bg-confidence-amber/15 text-confidence-amber font-mono-timer text-[11px] font-bold">
              <CountUp to={dueReviews.length} duration={0.8} />
            </span>
          </Link>

          <Link
            to="/settings"
            aria-label="Settings"
            className="w-10 h-10 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-all flex items-center justify-center border border-outline-variant/30 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
          </Link>
        </div>
      </section>

      {/* Streamlined Daily Cadence Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/20 text-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1 font-mono-timer text-confidence-amber font-bold">
            <span className="material-symbols-outlined text-[15px]">local_fire_department</span>
            14D Streak
          </span>
          <span className="text-outline-variant">•</span>
          <span className="text-on-surface-variant font-mono-code">
            {dueReviews.length > 0
              ? `${dueReviews.length} spaced repetition cards queued for review`
              : 'Spaced repetition deck synchronized'}
          </span>
        </div>
        <Link
          to="/quiz/srs"
          className="font-mono-code text-primary hover:underline flex items-center gap-1 font-semibold self-start sm:self-auto"
        >
          <span>Open SRS Queue</span>
          <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
        </Link>
      </div>

      {/* Minimalist Metric Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Item Bank */}
        <div className="rounded-xl bg-surface-container-low p-4 sm:p-5 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono uppercase tracking-wider">Item Bank</span>
            <span className="material-symbols-outlined text-primary text-[18px]">library_books</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight font-mono">
              <CountUp to={meta?.total_questions || 3609} duration={1.2} separator="," />
            </div>
            <div className="text-xs text-on-surface-variant font-mono-code mt-1">
              FE: 2,189 • AP: 1,420
            </div>
          </div>
        </div>

        {/* Metric 2: Attempts Logged */}
        <div className="rounded-xl bg-surface-container-low p-4 sm:p-5 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono uppercase tracking-wider">Attempts</span>
            <span className="material-symbols-outlined text-interactive-sky text-[18px]">history_edu</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight font-mono">
              <CountUp to={totalAttempts} duration={1.2} separator="," />
            </div>
            <div className="text-xs text-interactive-sky font-mono-code mt-1">
              {todayAttempts > 0 ? `+${todayAttempts} today` : `${avgTimeSeconds > 0 ? formatSeconds(avgTimeSeconds) : '1m 48s'} avg`}
            </div>
          </div>
        </div>

        {/* Metric 3: Overall Accuracy */}
        <div className="rounded-xl bg-surface-container-low p-4 sm:p-5 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono uppercase tracking-wider">Accuracy</span>
            <span className="material-symbols-outlined text-mastery-emerald text-[18px]">verified</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight font-mono">
              <CountUp to={totalAttempts > 0 ? overallAccuracy : 78.4} decimals={1} suffix="%" duration={1.2} />
            </div>
            <div className="text-xs text-mastery-emerald font-mono-code mt-1">
              Passing benchmark ≥60%
            </div>
          </div>
        </div>

        {/* Metric 4: SRS Due Deck */}
        <div className="rounded-xl bg-surface-container-low p-4 sm:p-5 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-xs font-mono uppercase tracking-wider">SRS Deck</span>
            <span className="material-symbols-outlined text-confidence-amber text-[18px]">bolt</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl sm:text-3xl font-extrabold text-confidence-amber tracking-tight font-mono">
              <CountUp to={dueReviews.length} duration={1.0} />
            </div>
            <div className="text-xs text-on-surface-variant font-mono-code mt-1">
              {criticalFailCount > 0 ? `${criticalFailCount} critical cards` : 'Calibrated retention'}
            </div>
          </div>
        </div>
      </section>

      {/* Focus & Analytics Grid (Weak Spots & 7-Day Velocity) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Priority Weak Spots (8 cols) */}
        <div className="lg:col-span-8 rounded-xl bg-surface-container-low p-5 sm:p-6 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-error" />
              <h2 className="font-semibold text-base text-on-surface">Priority Weak Spots</h2>
            </div>
            <span className="font-mono-code text-xs text-on-surface-variant">
              Based on {totalAttempts > 0 ? `${totalAttempts} attempts` : 'diagnostic baseline'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 my-3">
            {topWeakSpots.length > 0 ? (
              topWeakSpots.map((ws, index) => {
                const colorClass = index === 0 ? 'text-error' : index === 1 ? 'text-confidence-amber' : 'text-interactive-sky';
                const bgBarClass = index === 0 ? 'bg-error' : index === 1 ? 'bg-confidence-amber' : 'bg-interactive-sky';
                return (
                  <div
                    key={ws.topic}
                    className="bg-surface-container rounded-lg p-3.5 flex flex-col justify-between border border-outline-variant/20"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className={`font-mono text-xs ${colorClass} uppercase truncate max-w-[130px]`}>
                        {ws.topic}
                      </span>
                      <span className={`font-mono-timer text-xs ${colorClass} font-bold`}>
                        {ws.errorRate}%
                      </span>
                    </div>
                    <div className="my-2.5">
                      <div className="font-semibold text-xs text-on-surface capitalize line-clamp-1">{ws.topic}</div>
                      <div className="font-mono-code text-[11px] text-on-surface-variant pt-0.5">
                        {ws.incorrectAttempts} error / {ws.totalAttempts} reps
                      </div>
                    </div>
                    <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden mb-2.5">
                      <div className={`${bgBarClass} h-full rounded-full`} style={{ width: `${ws.errorRate}%` }} />
                    </div>
                    <Link
                      to={`/quiz/topic?topic=${encodeURIComponent(ws.topic)}`}
                      className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                    >
                      <span>Drill</span>
                      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                    </Link>
                  </div>
                );
              })
            ) : (
              <>
                <div className="bg-surface-container rounded-lg p-3.5 flex flex-col justify-between border border-outline-variant/20">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-xs text-error">NETWORKS</span>
                    <span className="font-mono-timer text-xs text-error font-bold">48%</span>
                  </div>
                  <div className="my-2.5">
                    <div className="font-semibold text-xs text-on-surface line-clamp-1">Computer Networks</div>
                    <div className="font-mono-code text-[11px] text-on-surface-variant pt-0.5">OSI, Subnets, TLS 1.3</div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden mb-2.5">
                    <div className="bg-error h-full rounded-full" style={{ width: '48%' }} />
                  </div>
                  <Link
                    to="/quiz/topic?topic=network"
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Drill Topic</span>
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </Link>
                </div>

                <div className="bg-surface-container rounded-lg p-3.5 flex flex-col justify-between border border-outline-variant/20">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-xs text-confidence-amber">SYSTEM ARCH</span>
                    <span className="font-mono-timer text-xs text-confidence-amber font-bold">54%</span>
                  </div>
                  <div className="my-2.5">
                    <div className="font-semibold text-xs text-on-surface line-clamp-1">Computer Architecture</div>
                    <div className="font-mono-code text-[11px] text-on-surface-variant pt-0.5">Pipelines, Cache Coherency</div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden mb-2.5">
                    <div className="bg-confidence-amber h-full rounded-full" style={{ width: '54%' }} />
                  </div>
                  <Link
                    to="/quiz/topic?topic=architecture"
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Drill Topic</span>
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </Link>
                </div>

                <div className="bg-surface-container rounded-lg p-3.5 flex flex-col justify-between border border-outline-variant/20">
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-xs text-interactive-sky">DATA STRUCT</span>
                    <span className="font-mono-timer text-xs text-interactive-sky font-bold">59%</span>
                  </div>
                  <div className="my-2.5">
                    <div className="font-semibold text-xs text-on-surface line-clamp-1">Data Structures</div>
                    <div className="font-mono-code text-[11px] text-on-surface-variant pt-0.5">AVL Trees, Hash Tables</div>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden mb-2.5">
                    <div className="bg-interactive-sky h-full rounded-full" style={{ width: '59%' }} />
                  </div>
                  <Link
                    to="/quiz/topic?topic=algorithms"
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary-container text-on-surface hover:text-on-primary font-mono-code text-xs font-semibold flex items-center justify-center gap-1 transition-all"
                  >
                    <span>Drill Topic</span>
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </Link>
                </div>
              </>
            )}
          </div>

          <div className="pt-1 flex items-center justify-between font-mono-code text-xs text-on-surface-variant">
            <span>Automated Leitner queue reshuffles on failure</span>
            <Link to="/analytics" className="text-primary hover:underline flex items-center gap-1">
              <span>Syllabus Heatmap</span>
              <span className="material-symbols-outlined text-[13px]">east</span>
            </Link>
          </div>
        </div>

        {/* 7-Day Velocity Chart (4 cols) */}
        <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-5 sm:p-6 border border-outline-variant/20 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/10">
            <span className="text-xs font-mono uppercase tracking-wider text-on-surface-variant">
              7-Day Activity
            </span>
            <span className="font-mono-code text-xs text-primary font-bold">+4.2%</span>
          </div>

          <div className="my-3 py-1">
            <svg className="w-full h-24 overflow-visible text-primary" fill="none" viewBox="0 0 300 100">
              <defs>
                <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#9ed67c" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#9ed67c" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line stroke="var(--color-surface-container-highest)" strokeDasharray="2 4" strokeWidth="1" x1="0" x2="300" y1="20" y2="20" />
              <line stroke="var(--color-surface-container-highest)" strokeDasharray="2 4" strokeWidth="1" x1="0" x2="300" y1="50" y2="50" />
              <line stroke="var(--color-surface-container-highest)" strokeDasharray="2 4" strokeWidth="1" x1="0" x2="300" y1="80" y2="80" />
              <polygon fill="url(#areaGradient)" points={polygonStr} />
              <polyline
                fill="none"
                points={polylineStr}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
              {sparkPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  fill="var(--color-surface-container-lowest)"
                  r={i === sparkPoints.length - 1 ? 4 : 3}
                  stroke="#9ed67c"
                  strokeWidth="2"
                />
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-between font-mono-code text-xs text-on-surface-variant pt-1">
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

      {/* Recent Activity Table & Exam Blueprint Scope */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Attempts (8 cols) */}
        <div className="lg:col-span-8 rounded-xl bg-surface-container-low p-5 sm:p-6 border border-outline-variant/20 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px]">history</span>
              <h2 className="font-semibold text-base text-on-surface">Recent Attempts</h2>
            </div>
            <button
              onClick={handleExportCSV}
              className="font-mono-code text-xs text-primary hover:underline flex items-center gap-1 cursor-pointer"
              type="button"
            >
              <span>Export CSV</span>
              <span className="material-symbols-outlined text-[14px]">download</span>
            </button>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-left font-mono-code text-xs">
              <thead>
                <tr className="text-on-surface-variant font-mono uppercase bg-surface-container/50 text-[11px]">
                  <th className="py-2 px-3 rounded-l-lg">ID</th>
                  <th className="py-2 px-3">Topic</th>
                  <th className="py-2 px-3">Selected</th>
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Confidence</th>
                  <th className="py-2 px-3 rounded-r-lg text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y-0 text-on-surface">
                {recentAttempts.length > 0 ? (
                  recentAttempts.map((att, i) => (
                    <tr key={att.id || i} className="hover:bg-surface-container/60 transition-colors group">
                      <td className="py-2.5 px-3 font-bold text-on-surface">
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
                      <td className="py-2.5 px-3 text-on-surface-variant capitalize">{att.topic}</td>
                      <td className="py-2.5 px-3 uppercase font-bold text-primary">{att.selectedAnswer}</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">{att.timeSeconds?.toFixed(1)}s</td>
                      <td className="py-2.5 px-3 text-confidence-amber">Level {att.confidence || 3}</td>
                      <td className="py-2.5 px-3 text-right">
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
                    <tr className="hover:bg-surface-container/60 transition-colors group">
                      <td className="py-2.5 px-3 font-bold text-on-surface">#FE-2024-S02</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">Full Year Morning 2024</td>
                      <td className="py-2.5 px-3">80/80</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">1h 42m</td>
                      <td className="py-2.5 px-3 text-confidence-amber">Level 4</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mastery-emerald/15 text-mastery-emerald font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-mastery-emerald" />
                          Passed
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container/60 transition-colors group">
                      <td className="py-2.5 px-3 font-bold text-on-surface">#SRS-REV-094</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">SRS Leitner Level 3</td>
                      <td className="py-2.5 px-3">30/30</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">24m 10s</td>
                      <td className="py-2.5 px-3 text-confidence-amber">Level 5</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mastery-emerald/15 text-mastery-emerald font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-mastery-emerald" />
                          Passed
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-surface-container/60 transition-colors group">
                      <td className="py-2.5 px-3 font-bold text-on-surface">#DRILL-NET-11</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">Networks (OSI &amp; TCP)</td>
                      <td className="py-2.5 px-3">25/25</td>
                      <td className="py-2.5 px-3 text-on-surface-variant">31m 05s</td>
                      <td className="py-2.5 px-3 text-confidence-amber">Level 2</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error/15 text-error font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-error" />
                          Review
                        </span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Syllabus Scope (4 cols) */}
        <div className="lg:col-span-4 rounded-xl bg-surface-container-low p-5 sm:p-6 border border-outline-variant/20 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base text-on-surface">Syllabus Scope</h2>
            <span className="font-mono text-xs text-primary uppercase">IPA Standard</span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-on-surface">
              <span>Morning Session</span>
              <span className="text-primary">80 Questions / 150m</span>
            </div>
            <p className="text-[11px] font-mono-code text-on-surface-variant pt-0.5">
              Accredited Fundamental &amp; Applied curriculum standard
            </p>
          </div>

          {/* Curated Topic Stack */}
          <div className="flex flex-col gap-1.5 font-mono-code text-xs">
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-container border border-outline-variant/10">
              <span className="text-on-surface-variant">1. Technology Architecture</span>
              <span className="text-on-surface font-semibold">45 Questions</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-container border border-outline-variant/10">
              <span className="text-on-surface-variant">2. Management Systems</span>
              <span className="text-on-surface font-semibold">15 Questions</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-container border border-outline-variant/10">
              <span className="text-on-surface-variant">3. Strategy &amp; Governance</span>
              <span className="text-on-surface font-semibold">20 Questions</span>
            </div>
          </div>

          <Link
            to="/analytics"
            className="w-full py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs flex items-center justify-center gap-1.5 transition-all border border-outline-variant/20 shadow-sm"
          >
            <span className="material-symbols-outlined text-[15px] text-primary">assessment</span>
            <span>Diagnostic Report</span>
          </Link>
        </div>
      </section>
    </div>
  );
};

import { db } from '../db';
import type { AttemptRecord } from '../db/schema';
import { QuestionsService } from './questionsService';

export interface ExamTypeBucket {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  avgTimeSeconds: number;
  recentAccuracy: number;
  earlierAccuracy: number;
  improvementDelta: number;
  passReadiness: 'passed' | 'approaching' | 'needs_work';
  topHardTopics: Array<{ topic: string; errorRate: number; total: number }>;
}

export interface ExamTypeTimelinePoint {
  id: string;
  date: string;
  time: string;
  timestamp: string;
  feAAccuracy: number | null;
  feBAccuracy: number | null;
  feACount: number;
  feBCount: number;
  feAPace: number;
  feBPace: number;
  feARolling: number;
  feBRolling: number;
  feAImprovement: number;
  feBImprovement: number;
}

export interface ExamTypeImprovementData {
  hasRealData: boolean;
  feA: ExamTypeBucket;
  feB: ExamTypeBucket;
  difficultyGap: {
    accuracyGap: number;
    paceRatio: number;
    feBHarderPercent: number;
  };
  timeline: ExamTypeTimelinePoint[];
}

export const REGISTERED_TOPICS = [
  'accounting',
  'algorithms',
  'artificial-intelligence',
  'automata-theory',
  'business-administration',
  'cloud-computing',
  'cybersecurity',
  'data-encoding',
  'data-structures',
  'devops',
  'digital-logic',
  'hardware',
  'information-management',
  'math',
  'networking',
  'number-systems',
  'object-oriented-programming',
  'operating-systems',
  'probability',
  'programming',
  'project-management',
  'service-management',
  'sets',
  'software',
  'software-engineering',
  'software-testing',
  'statistics',
  'systems-architecture',
  'web-technologies',
];

export class AnalyticsEngine {
  static async getErrorRates() {
    const attempts = await db.attempts.toArray();
    const topicMap: Record<string, { total: number; correct: number; totalTime: number }> = {};

    for (const t of REGISTERED_TOPICS) {
      topicMap[t] = { total: 0, correct: 0, totalTime: 0 };
    }

    for (const a of attempts) {
      const t = a.topic || 'software';
      if (!topicMap[t]) topicMap[t] = { total: 0, correct: 0, totalTime: 0 };
      topicMap[t].total += 1;
      if (a.isCorrect) topicMap[t].correct += 1;
      topicMap[t].totalTime += a.timeSeconds || 0;
    }

    const res = REGISTERED_TOPICS.map((topic) => {
      const d = topicMap[topic];
      const incorrect = d.total - d.correct;
      const errorRate = d.total > 0 ? Math.round((incorrect / d.total) * 1000) / 10 : 0;
      const avgTime = d.total > 0 ? Math.round((d.totalTime / d.total) * 10) / 10 : 0;
      return {
        topic,
        totalAttempts: d.total,
        correctAttempts: d.correct,
        incorrectAttempts: incorrect,
        errorRate,
        accuracyRate: d.total > 0 ? Math.round((100 - errorRate) * 10) / 10 : 0,
        avgTimeSeconds: avgTime,
      };
    });

    res.sort((a, b) => b.errorRate - a.errorRate || b.totalAttempts - a.totalAttempts);
    return res;
  }

  static async getPriorityWeakSpots() {
    const rates = await this.getErrorRates();
    const attempts = await db.attempts.toArray();
    const now = Date.now();

    const lastTimeByTopic: Record<string, number> = {};
    for (const a of attempts) {
      const ts = new Date(a.timestamp).getTime();
      if (!lastTimeByTopic[a.topic] || ts > lastTimeByTopic[a.topic]) {
        lastTimeByTopic[a.topic] = ts;
      }
    }

    const weakSpots = [];
    for (const r of rates) {
      if (r.totalAttempts === 0) continue;

      let recencyFactor = 1.0;
      const lastTs = lastTimeByTopic[r.topic];
      if (lastTs) {
        const daysAgo = (now - lastTs) / (1000 * 86400);
        if (daysAgo < 3) recencyFactor = 1.2;
        else if (daysAgo > 14) recencyFactor = 0.9;
      }

      const confidenceWeight = Math.min(1.0, r.totalAttempts / 5.0);
      const priorityScore = Math.round(
        (r.errorRate * 0.7 + r.incorrectAttempts * 3 * 0.3) * recencyFactor * confidenceWeight * 10
      ) / 10;

      let status: 'critical' | 'moderate' | 'strong' = 'strong';
      if (r.errorRate >= 50) status = 'critical';
      else if (r.errorRate >= 25) status = 'moderate';

      weakSpots.push({
        topic: r.topic,
        errorRate: r.errorRate,
        totalAttempts: r.totalAttempts,
        incorrectAttempts: r.incorrectAttempts,
        priorityScore,
        status,
        avgTimeSeconds: r.avgTimeSeconds,
      });
    }

    weakSpots.sort((a, b) => b.priorityScore - a.priorityScore);
    return weakSpots;
  }

  static async getConsistencyScore() {
    const attempts = await db.attempts.orderBy('timestamp').toArray();
    if (attempts.length < 5) {
      return {
        overallConsistency: 100,
        stdDeviation: 0,
        meanAccuracy: 100,
        trend: 'stable' as const,
        status: 'insufficient_data' as const,
      };
    }

    const windowSize = 5;
    const rolling: number[] = [];
    for (let i = 0; i <= attempts.length - windowSize; i++) {
      const win = attempts.slice(i, i + windowSize);
      const acc = (win.filter((a) => a.isCorrect).length / windowSize) * 100;
      rolling.push(acc);
    }

    const meanAcc = rolling.reduce((s, x) => s + x, 0) / rolling.length;
    const variance = rolling.reduce((s, x) => s + Math.pow(x - meanAcc, 2), 0) / rolling.length;
    const stdDev = Math.sqrt(variance);
    const consistencyPct = Math.max(0, Math.min(100, Math.round((100 - stdDev * 2) * 10) / 10));

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (rolling.length >= 3) {
      const recent = (rolling[rolling.length - 1] + rolling[rolling.length - 2] + rolling[rolling.length - 3]) / 3;
      const earlier = (rolling[0] + rolling[1] + rolling[2]) / 3;
      if (recent > earlier + 5) trend = 'improving';
      else if (recent < earlier - 5) trend = 'declining';
    }

    return {
      overallConsistency: consistencyPct,
      stdDeviation: Math.round(stdDev * 10) / 10,
      meanAccuracy: Math.round(meanAcc * 10) / 10,
      trend,
      status: 'active' as const,
    };
  }

  static async getConfidenceCalibration() {
    const attempts = await db.attempts.toArray();
    const valid = attempts.filter((a) => a.confidence !== undefined && a.confidence !== null);

    if (valid.length === 0) {
      return {
        hasData: false,
        brierScore: 0,
        calibrationAccuracy: 100,
        overconfidenceRate: 0,
        underconfidenceRate: 0,
        bins: [],
      };
    }

    const binDefs = [
      { level: 1, label: 'Wild Guess (1)', expected: 0.2 },
      { level: 2, label: 'Low Confidence (2)', expected: 0.4 },
      { level: 3, label: 'Moderate (3)', expected: 0.6 },
      { level: 4, label: 'Confident (4)', expected: 0.8 },
      { level: 5, label: '100% Certain (5)', expected: 1.0 },
    ];

    const counts: Record<number, { total: number; correct: number }> = {
      1: { total: 0, correct: 0 },
      2: { total: 0, correct: 0 },
      3: { total: 0, correct: 0 },
      4: { total: 0, correct: 0 },
      5: { total: 0, correct: 0 },
    };

    let brierSum = 0;
    for (const a of valid) {
      const conf = Math.max(1, Math.min(5, Math.round(a.confidence)));
      counts[conf].total += 1;
      const isC = a.isCorrect ? 1 : 0;
      if (isC) counts[conf].correct += 1;
      const expProb = binDefs[conf - 1].expected;
      brierSum += Math.pow(expProb - isC, 2);
    }

    const brierScore = Math.round((brierSum / valid.length) * 10000) / 10000;

    const highConf = valid.filter((a) => a.confidence >= 4);
    const highConfWrong = highConf.filter((a) => !a.isCorrect).length;
    const overconfidenceRate = highConf.length > 0 ? Math.round((highConfWrong / highConf.length) * 1000) / 10 : 0;

    const lowConf = valid.filter((a) => a.confidence <= 2);
    const lowConfRight = lowConf.filter((a) => a.isCorrect).length;
    const underconfidenceRate = lowConf.length > 0 ? Math.round((lowConfRight / lowConf.length) * 1000) / 10 : 0;

    const bins = binDefs.map((b) => {
      const c = counts[b.level];
      const actualAcc = c.total > 0 ? Math.round((c.correct / c.total) * 1000) / 10 : 0;
      const expAcc = Math.round(b.expected * 1000) / 10;
      return {
        confidenceLevel: b.level,
        label: b.label,
        totalAttempts: c.total,
        correctAttempts: c.correct,
        actualAccuracy: actualAcc,
        expectedAccuracy: expAcc,
        gap: Math.round((actualAcc - expAcc) * 10) / 10,
      };
    });

    const activeBins = bins.filter((b) => b.totalAttempts > 0);
    const meanGap = activeBins.length > 0
      ? activeBins.reduce((s, b) => s + Math.abs(b.gap), 0) / activeBins.length
      : 0;
    const calibrationAccuracy = Math.max(0, Math.round((100 - meanGap) * 10) / 10);

    return {
      hasData: true,
      totalEvaluated: valid.length,
      brierScore,
      calibrationAccuracy,
      overconfidenceRate,
      underconfidenceRate,
      bins,
    };
  }

  static async getHeatmap(interval: 'day' | 'week' | 'month' = 'week') {
    const attempts = await db.attempts.toArray();
    const periodMap: Record<string, Record<string, { total: number; incorrect: number; time: number }>> = {};
    const allPeriods = new Set<string>();

    for (const a of attempts) {
      const dt = new Date(a.timestamp);
      let pKey = '';
      if (interval === 'day') {
        pKey = dt.toISOString().split('T')[0];
      } else if (interval === 'month') {
        pKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      } else {
        // week
        const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
        pKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
      }

      const t = a.topic || 'software';
      if (!periodMap[t]) periodMap[t] = {};
      if (!periodMap[t][pKey]) periodMap[t][pKey] = { total: 0, incorrect: 0, time: 0 };
      periodMap[t][pKey].total += 1;
      if (!a.isCorrect) periodMap[t][pKey].incorrect += 1;
      periodMap[t][pKey].time += a.timeSeconds || 0;
      allPeriods.add(pKey);
    }

    let sortedPeriods = Array.from(allPeriods).sort();
    if (sortedPeriods.length === 0) {
      const now = new Date();
      sortedPeriods = [
        interval === 'day'
          ? now.toISOString().split('T')[0]
          : interval === 'month'
          ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
          : `${now.getFullYear()}-W${String(Math.ceil((now.getDate() + 6) / 7)).padStart(2, '0')}`,
      ];
    }

    const matrix: Record<string, Array<{ period: string; attemptCount: number; errorRate: number | null; avgTimeSec: number }>> = {};

    for (const topic of REGISTERED_TOPICS) {
      matrix[topic] = sortedPeriods.map((p) => {
        const cell = periodMap[topic]?.[p];
        if (!cell || cell.total === 0) {
          return { period: p, attemptCount: 0, errorRate: null, avgTimeSec: 0 };
        }
        return {
          period: p,
          attemptCount: cell.total,
          errorRate: Math.round((cell.incorrect / cell.total) * 1000) / 10,
          avgTimeSec: Math.round((cell.time / cell.total) * 10) / 10,
        };
      });
    }

    return {
      interval,
      periods: sortedPeriods,
      matrix,
    };
  }

  static async getExamTypeImprovementStats(): Promise<ExamTypeImprovementData> {
    const [allQuestions, attempts] = await Promise.all([
      QuestionsService.loadAllQuestions(),
      db.attempts.orderBy('timestamp').toArray(),
    ]);

    const feAAttempts: AttemptRecord[] = [];
    const feBAttempts: AttemptRecord[] = [];

    for (const a of attempts) {
      const q = allQuestions[a.questionId];
      const isB =
        q?.paper === 'FE-B' ||
        q?.paper === 'PM' ||
        a.questionId.includes('FE-B') ||
        a.questionId.includes('_PM') ||
        a.questionId.includes('PM-');
      if (isB) {
        feBAttempts.push(a);
      } else {
        feAAttempts.push(a);
      }
    }

    const computeBucket = (list: AttemptRecord[]): ExamTypeBucket => {
      if (list.length === 0) {
        return {
          totalAttempts: 0,
          correctAttempts: 0,
          accuracy: 0,
          avgTimeSeconds: 0,
          recentAccuracy: 0,
          earlierAccuracy: 0,
          improvementDelta: 0,
          passReadiness: 'needs_work',
          topHardTopics: [],
        };
      }

      const totalAttempts = list.length;
      const correctAttempts = list.filter((a) => a.isCorrect).length;
      const accuracy = Math.round((correctAttempts / totalAttempts) * 1000) / 10;
      const avgTimeSeconds =
        Math.round((list.reduce((s, a) => s + (a.timeSeconds || 0), 0) / totalAttempts) * 10) / 10;

      // Improvement Delta: compare recent half with earlier half
      const half = Math.max(1, Math.floor(list.length / 2));
      const earlier = list.slice(0, half);
      const recent = list.slice(half);

      const earlierAcc =
        earlier.length > 0 ? (earlier.filter((a) => a.isCorrect).length / earlier.length) * 100 : accuracy;
      const recentAcc =
        recent.length > 0 ? (recent.filter((a) => a.isCorrect).length / recent.length) * 100 : accuracy;

      const improvementDelta = Math.round((recentAcc - earlierAcc) * 10) / 10;

      let passReadiness: 'passed' | 'approaching' | 'needs_work' = 'needs_work';
      if (recentAcc >= 60) passReadiness = 'passed';
      else if (recentAcc >= 50) passReadiness = 'approaching';

      // Hardest topics for this exam type
      const topicCount: Record<string, { total: number; incorrect: number }> = {};
      for (const a of list) {
        const top = a.topic || 'general';
        if (!topicCount[top]) topicCount[top] = { total: 0, incorrect: 0 };
        topicCount[top].total++;
        if (!a.isCorrect) topicCount[top].incorrect++;
      }

      const topHardTopics = Object.entries(topicCount)
        .map(([topic, c]) => ({
          topic,
          errorRate: Math.round((c.incorrect / c.total) * 1000) / 10,
          total: c.total,
        }))
        .filter((t) => t.total >= 1)
        .sort((a, b) => b.errorRate - a.errorRate || b.total - a.total)
        .slice(0, 3);

      return {
        totalAttempts,
        correctAttempts,
        accuracy,
        avgTimeSeconds,
        recentAccuracy: Math.round(recentAcc * 10) / 10,
        earlierAccuracy: Math.round(earlierAcc * 10) / 10,
        improvementDelta,
        passReadiness,
        topHardTopics,
      };
    };

    const feABucket = computeBucket(feAAttempts);
    const feBBucket = computeBucket(feBAttempts);

    // Difficulty Gap calculation
    const accuracyGap = Math.round((feABucket.accuracy - feBBucket.accuracy) * 10) / 10;
    const paceRatio =
      feABucket.avgTimeSeconds > 0
        ? Math.round((feBBucket.avgTimeSeconds / feABucket.avgTimeSeconds) * 10) / 10
        : 1.0;
    const feBHarderPercent = Math.max(0, accuracyGap);

    // Build timeline points: Group attempts into date slices
    const timeline: ExamTypeTimelinePoint[] = [];

    if (attempts.length >= 2) {
      const groups = new Map<string, { feA: AttemptRecord[]; feB: AttemptRecord[]; ts: number; dt: Date }>();
      for (const a of attempts) {
        const dt = new Date(a.timestamp);
        const key = dt.toISOString().split('T')[0];
        if (!groups.has(key)) {
          groups.set(key, { feA: [], feB: [], ts: dt.getTime(), dt });
        }
        const g = groups.get(key)!;
        const q = allQuestions[a.questionId];
        const isB =
          q?.paper === 'FE-B' ||
          q?.paper === 'PM' ||
          a.questionId.includes('FE-B') ||
          a.questionId.includes('_PM') ||
          a.questionId.includes('PM-');
        if (isB) g.feB.push(a);
        else g.feA.push(a);
      }

      let runningACount = 0;
      let runningACorrect = 0;
      let runningBCount = 0;
      let runningBCorrect = 0;
      let initialARolling = 0;
      let initialBRolling = 0;

      const sortedEntries = Array.from(groups.entries()).sort((a, b) => a[1].ts - b[1].ts);

      sortedEntries.forEach(([key, g], idx) => {
        const aCount = g.feA.length;
        const aCorrect = g.feA.filter((a) => a.isCorrect).length;
        const aAcc = aCount > 0 ? Math.round((aCorrect / aCount) * 1000) / 10 : null;
        const aPace =
          aCount > 0 ? Math.round((g.feA.reduce((s, a) => s + (a.timeSeconds || 0), 0) / aCount) * 10) / 10 : 0;

        const bCount = g.feB.length;
        const bCorrect = g.feB.filter((a) => a.isCorrect).length;
        const bAcc = bCount > 0 ? Math.round((bCorrect / bCount) * 1000) / 10 : null;
        const bPace =
          bCount > 0 ? Math.round((g.feB.reduce((s, a) => s + (a.timeSeconds || 0), 0) / bCount) * 10) / 10 : 0;

        runningACount += aCount;
        runningACorrect += aCorrect;
        runningBCount += bCount;
        runningBCorrect += bCorrect;

        const aRolling = runningACount > 0 ? Math.round((runningACorrect / runningACount) * 1000) / 10 : 0;
        const bRolling = runningBCount > 0 ? Math.round((runningBCorrect / runningBCount) * 1000) / 10 : 0;

        if (idx === 0) {
          initialARolling = aRolling;
          initialBRolling = bRolling;
        }

        timeline.push({
          id: key,
          date: g.dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          time: g.dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
          timestamp: g.dt.toISOString(),
          feAAccuracy: aAcc,
          feBAccuracy: bAcc,
          feACount: aCount,
          feBCount: bCount,
          feAPace: aPace,
          feBPace: bPace,
          feARolling: aRolling,
          feBRolling: bRolling,
          feAImprovement: Math.round((aRolling - initialARolling) * 10) / 10,
          feBImprovement: Math.round((bRolling - initialBRolling) * 10) / 10,
        });
      });
    }

    const hasRealData = attempts.length >= 3;
    if (!hasRealData) {
      const now = Date.now();
      const demoDays = [
        { d: 14, aAcc: 52, bAcc: 30, aPace: 78, bPace: 180, aC: 15, bC: 5 },
        { d: 11, aAcc: 58, bAcc: 36, aPace: 70, bPace: 165, aC: 20, bC: 8 },
        { d: 8, aAcc: 64, bAcc: 42, aPace: 62, bPace: 155, aC: 25, bC: 10 },
        { d: 6, aAcc: 68, bAcc: 48, aPace: 55, bPace: 145, aC: 30, bC: 12 },
        { d: 4, aAcc: 72, bAcc: 52, aPace: 50, bPace: 135, aC: 25, bC: 10 },
        { d: 2, aAcc: 76, bAcc: 56, aPace: 46, bPace: 128, aC: 35, bC: 15 },
        { d: 0, aAcc: 80, bAcc: 62, aPace: 42, bPace: 120, aC: 40, bC: 20 },
      ];

      return {
        hasRealData: false,
        feA: {
          totalAttempts: 185,
          correctAttempts: 139,
          accuracy: 75.1,
          avgTimeSeconds: 52.4,
          recentAccuracy: 80.0,
          earlierAccuracy: 55.0,
          improvementDelta: 25.0,
          passReadiness: 'passed',
          topHardTopics: [
            { topic: 'digital-logic', errorRate: 34.2, total: 38 },
            { topic: 'operating-systems', errorRate: 28.5, total: 42 },
            { topic: 'math', errorRate: 25.0, total: 24 },
          ],
        },
        feB: {
          totalAttempts: 80,
          correctAttempts: 44,
          accuracy: 55.0,
          avgTimeSeconds: 138.6,
          recentAccuracy: 62.0,
          earlierAccuracy: 33.0,
          improvementDelta: 29.0,
          passReadiness: 'passed',
          topHardTopics: [
            { topic: 'algorithms', errorRate: 52.6, total: 38 },
            { topic: 'cybersecurity', errorRate: 46.2, total: 26 },
            { topic: 'data-structures', errorRate: 41.7, total: 24 },
          ],
        },
        difficultyGap: {
          accuracyGap: 20.1,
          paceRatio: 2.6,
          feBHarderPercent: 20.1,
        },
        timeline: demoDays.map((dm, idx) => {
          const dt = new Date(now - dm.d * 86400000);
          return {
            id: `demo-${idx}`,
            date: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            time: dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
            timestamp: dt.toISOString(),
            feAAccuracy: dm.aAcc,
            feBAccuracy: dm.bAcc,
            feACount: dm.aC,
            feBCount: dm.bC,
            feAPace: dm.aPace,
            feBPace: dm.bPace,
            feARolling: dm.aAcc,
            feBRolling: dm.bAcc,
            feAImprovement: dm.aAcc - 52,
            feBImprovement: dm.bAcc - 30,
          };
        }),
      };
    }

    return {
      hasRealData: true,
      feA: feABucket,
      feB: feBBucket,
      difficultyGap: {
        accuracyGap,
        paceRatio,
        feBHarderPercent,
      },
      timeline,
    };
  }
}

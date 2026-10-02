import { db } from '../db';
import type { AttemptRecord } from '../db/schema';

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
}

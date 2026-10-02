import type { SRScheduleRecord, AttemptRecord } from '../db/schema';

export type SRAlgorithm = 'SM-2' | 'FSRS' | 'Custom';

export class SRSEngine {
  static getInitialSchedule(questionId: string, algorithm: SRAlgorithm): SRScheduleRecord {
    const nowIso = new Date().toISOString();
    return {
      questionId,
      algorithm,
      repetitionNumber: 0,
      easinessFactor: 2.5,
      stability: algorithm === 'FSRS' ? 0 : undefined,
      difficulty: algorithm === 'FSRS' ? 5.0 : undefined,
      intervalDays: 0,
      nextReviewDate: nowIso,
      lastReviewDate: undefined,
    };
  }

  static calculateNextReview(
    curr: SRScheduleRecord,
    isCorrect: boolean,
    confidence: number = 3,
    timeSeconds: number = 30,
    topicErrorRate: number = 0.3,
    reviewDate: Date = new Date()
  ): SRScheduleRecord {
    // Determine 0-5 grade from correctness + confidence
    let grade = 3;
    if (isCorrect) {
      grade = confidence >= 4 ? 5 : (confidence === 3 ? 4 : 3);
    } else {
      grade = confidence >= 4 ? 0 : (confidence === 3 ? 1 : 2);
    }

    if (curr.algorithm === 'FSRS') {
      return this.computeFSRS(curr, grade, reviewDate);
    } else if (curr.algorithm === 'Custom') {
      return this.computeCustom(curr, isCorrect, confidence, timeSeconds, topicErrorRate, reviewDate);
    } else {
      return this.computeSM2(curr, grade, reviewDate);
    }
  }

  private static computeSM2(curr: SRScheduleRecord, grade: number, reviewDate: Date): SRScheduleRecord {
    const g = Math.max(0, Math.min(5, grade));
    let ef = curr.easinessFactor || 2.5;
    let n = curr.repetitionNumber || 0;
    let interval = curr.intervalDays || 0;

    // EF' = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    const deltaEf = 0.1 - (5 - g) * (0.08 + (5 - g) * 0.02);
    ef = Math.max(1.3, Math.round((ef + deltaEf) * 100) / 100);

    let newInterval = 1;
    let newN = 0;

    if (g >= 3) {
      if (n === 0) {
        newInterval = 1;
      } else if (n === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.max(1, Math.round(interval * ef));
      }
      newN = n + 1;
    } else {
      newN = 0;
      newInterval = 1;
    }

    const nextDate = new Date(reviewDate.getTime() + newInterval * 86400000);

    return {
      ...curr,
      algorithm: 'SM-2',
      repetitionNumber: newN,
      easinessFactor: ef,
      intervalDays: newInterval,
      nextReviewDate: nextDate.toISOString(),
      lastReviewDate: reviewDate.toISOString(),
    };
  }

  private static computeFSRS(curr: SRScheduleRecord, grade: number, reviewDate: Date): SRScheduleRecord {
    // Map grade to FSRS rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    let rating = 3;
    if (grade <= 1) rating = 1;
    else if (grade === 2) rating = 2;
    else if (grade === 3 || grade === 4) rating = 3;
    else rating = 4;

    let stability = curr.stability || 0;
    let difficulty = curr.difficulty || 5.0;
    let n = curr.repetitionNumber || 0;
    let interval = 1;

    if (stability === 0) {
      // First review
      const initS = [0, 0.5, 1.2, 2.5, 4.8];
      const initD = [0, 7.5, 6.0, 5.0, 3.5];
      stability = initS[rating];
      difficulty = initD[rating];
      interval = Math.max(1, Math.round(stability));
      n = 1;
    } else {
      if (rating === 1) {
        // Lapse
        stability = Math.max(0.4, stability * 0.3);
        difficulty = Math.min(10.0, difficulty + 0.8);
        interval = 1;
        n = 0;
      } else {
        const factor = (rating === 2 ? 1.2 : (rating === 3 ? 2.4 : 3.8)) * ((11.0 - difficulty) / 6.0);
        stability = Math.max(1.0, stability * factor);
        const deltaD = rating === 2 ? 0.3 : (rating === 3 ? -0.1 : -0.5);
        difficulty = Math.max(1.0, Math.min(10.0, difficulty + deltaD));
        interval = Math.max(1, Math.round(stability));
        n = n + 1;
      }
    }

    const nextDate = new Date(reviewDate.getTime() + interval * 86400000);

    return {
      ...curr,
      algorithm: 'FSRS',
      repetitionNumber: n,
      stability: Math.round(stability * 100) / 100,
      difficulty: Math.round(difficulty * 100) / 100,
      intervalDays: interval,
      nextReviewDate: nextDate.toISOString(),
      lastReviewDate: reviewDate.toISOString(),
    };
  }

  private static computeCustom(
    curr: SRScheduleRecord,
    isCorrect: boolean,
    confidence: number,
    timeSeconds: number,
    topicErrorRate: number,
    reviewDate: Date
  ): SRScheduleRecord {
    let ef = curr.easinessFactor || 2.5;
    let n = curr.repetitionNumber || 0;
    let interval = curr.intervalDays || 0;

    let baseGrade = 3;
    if (isCorrect) {
      baseGrade = confidence >= 4 ? 5 : (confidence === 3 ? 4 : 3);
    } else {
      baseGrade = confidence >= 4 ? 0 : (confidence === 3 ? 1 : 2);
    }

    const deltaEf = 0.1 - (5 - baseGrade) * (0.08 + (5 - baseGrade) * 0.02);
    ef = Math.max(1.3, Math.round((ef + deltaEf) * 100) / 100);

    // Topic error rate multiplier
    const topicMultiplier = Math.max(0.6, Math.min(1.2, 1.2 - topicErrorRate));

    // Time response modifier
    let timeMultiplier = 1.0;
    if (timeSeconds > 90) timeMultiplier = 0.85;
    else if (timeSeconds < 25 && isCorrect) timeMultiplier = 1.10;

    let rawInterval = 1;
    let newN = 0;
    if (isCorrect) {
      if (n === 0) rawInterval = 1;
      else if (n === 1) rawInterval = 5;
      else rawInterval = Math.max(1, interval * ef);
      newN = n + 1;
    } else {
      newN = 0;
      rawInterval = 1;
    }

    const finalInterval = Math.max(1, Math.round(rawInterval * topicMultiplier * timeMultiplier));
    const nextDate = new Date(reviewDate.getTime() + finalInterval * 86400000);

    return {
      ...curr,
      algorithm: 'Custom',
      repetitionNumber: newN,
      easinessFactor: ef,
      intervalDays: finalInterval,
      nextReviewDate: nextDate.toISOString(),
      lastReviewDate: reviewDate.toISOString(),
    };
  }
}

import { db } from '../db';
import type { AttemptRecord, SRScheduleRecord, TopicStatRecord } from '../db/schema';
import { SRSEngine, type SRAlgorithm } from './srsEngine';

export class StatsDbService {
  static async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const record = await db.settings.get(key);
    return record ? (record.value as T) : defaultValue;
  }

  static async setSetting<T>(key: string, value: T): Promise<void> {
    await db.settings.put({ key, value });
  }

  static async recordAttempt(
    questionId: string,
    topic: string,
    selectedAnswer: string,
    isCorrect: boolean,
    timeSeconds: number,
    confidence: number = 3
  ): Promise<{ attempt: AttemptRecord; schedule: SRScheduleRecord }> {
    const nowIso = new Date().toISOString();

    const attempt: AttemptRecord = {
      questionId,
      topic,
      selectedAnswer,
      isCorrect,
      timeSeconds: Math.round(timeSeconds * 10) / 10,
      confidence,
      timestamp: nowIso,
    };

    // 1. Save attempt
    const attemptId = await db.attempts.add(attempt);
    attempt.id = attemptId;

    // 2. Update topic statistics
    let tStat = await db.topicStats.get(topic);
    if (!tStat) {
      tStat = {
        topic,
        totalAttempts: 0,
        correctAttempts: 0,
        totalTimeSeconds: 0,
        lastAttempt: nowIso,
      };
    }
    tStat.totalAttempts += 1;
    if (isCorrect) tStat.correctAttempts += 1;
    tStat.totalTimeSeconds += timeSeconds;
    tStat.lastAttempt = nowIso;
    await db.topicStats.put(tStat);

    // 3. Update SRS schedule
    const currentAlgo = await this.getSetting<SRAlgorithm>('spaced_repetition_algorithm', 'SM-2');
    let currSchedule = await db.srSchedules.get(questionId);
    if (!currSchedule || currSchedule.algorithm !== currentAlgo) {
      currSchedule = SRSEngine.getInitialSchedule(questionId, currentAlgo);
    }

    const topicErrorRate = (tStat.totalAttempts - tStat.correctAttempts) / tStat.totalAttempts;
    const updatedSchedule = SRSEngine.calculateNextReview(
      currSchedule,
      isCorrect,
      confidence,
      timeSeconds,
      topicErrorRate,
      new Date()
    );
    await db.srSchedules.put(updatedSchedule);

    return { attempt, schedule: updatedSchedule };
  }

  static async switchAlgorithmAndReplay(newAlgo: SRAlgorithm): Promise<number> {
    await this.setSetting('spaced_repetition_algorithm', newAlgo);

    const allAttempts = await db.attempts.orderBy('timestamp').toArray();
    const attemptsByQuestion = new Map<string, AttemptRecord[]>();

    for (const a of allAttempts) {
      if (!attemptsByQuestion.has(a.questionId)) {
        attemptsByQuestion.set(a.questionId, []);
      }
      attemptsByQuestion.get(a.questionId)!.push(a);
    }

    let recomputedCount = 0;
    for (const [qId, qAttempts] of attemptsByQuestion.entries()) {
      let schedule = SRSEngine.getInitialSchedule(qId, newAlgo);
      for (const a of qAttempts) {
        schedule = SRSEngine.calculateNextReview(
          schedule,
          a.isCorrect,
          a.confidence || 3,
          a.timeSeconds || 30,
          0.3,
          new Date(a.timestamp)
        );
      }
      await db.srSchedules.put(schedule);
      recomputedCount++;
    }

    return recomputedCount;
  }

  static async getDueReviews(): Promise<SRScheduleRecord[]> {
    const nowIso = new Date().toISOString();
    return db.srSchedules.filter((s) => s.nextReviewDate <= nowIso).toArray();
  }

  static async getQuestionHistory(questionId: string) {
    const attempts = await db.attempts.where('questionId').equals(questionId).toArray();
    const schedule = await db.srSchedules.get(questionId);
    return { attempts, schedule };
  }
}

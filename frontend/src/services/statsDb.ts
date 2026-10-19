import { db } from '../db';
import type { AttemptRecord, SRScheduleRecord, TopicStatRecord, DeferredRecord, SessionRecord, QuizMode } from '../db/schema';
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
    confidence: number = 3,
    extra: { choiceSwitches?: number; mode?: QuizMode } = {}
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
      ...(extra.choiceSwitches ? { choiceSwitches: extra.choiceSwitches } : {}),
      ...(extra.mode ? { mode: extra.mode } : {}),
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

  static async deferQuestion(questionId: string, topic: string, reason: string = 'cant_answer_now', sessionContext?: string): Promise<DeferredRecord> {
    const record: DeferredRecord = {
      questionId, topic, reason, deferredAt: new Date().toISOString(), sessionContext
    };
    const id = await db.deferred.add(record);
    record.id = id;
    return record;
  }

  static async getDeferredQuestions(): Promise<DeferredRecord[]> {
    return db.deferred.where('resolvedAt').equals('').or('resolvedAt').equals(undefined as any).toArray();
  }

  static async resolveDeferredQuestion(questionId: string): Promise<void> {
    await db.deferred.where('questionId').equals(questionId).modify({ resolvedAt: new Date().toISOString() });
  }

  static async startSession(sessionType: string, filterKey: string, totalQuestions: number): Promise<number> {
    return db.sessions.add({
      sessionType: sessionType as any,
      filterKey,
      totalQuestions,
      answeredQuestions: 0,
      correctAnswers: 0,
      startedAt: new Date().toISOString(),
      isCompleted: false,
    });
  }

  static async updateSessionProgress(sessionId: number, answeredQuestions: number, correctAnswers: number): Promise<void> {
    await db.sessions.update(sessionId, { answeredQuestions, correctAnswers });
  }

  static async completeSession(sessionId: number, answeredQuestions: number, correctAnswers: number): Promise<void> {
    await db.sessions.update(sessionId, {
      answeredQuestions,
      correctAnswers,
      completedAt: new Date().toISOString(),
      isCompleted: true,
    });
  }

  /** Saves a finished session with its per-question log (the after-session report reads it back) */
  static async saveCompletedSession(record: Omit<SessionRecord, 'id'>): Promise<number> {
    return db.sessions.add(record as SessionRecord);
  }

  static getSession(id: number): Promise<SessionRecord | undefined> {
    return db.sessions.get(id);
  }

  /** The latest finished session on the same set before this one, for the "vs last time" comparison */
  static async getPreviousSession(record: Pick<SessionRecord, 'sessionType' | 'filterKey' | 'startedAt'>) {
    const same = await db.sessions
      .where('filterKey')
      .equals(record.filterKey)
      .filter((s) => s.sessionType === record.sessionType && s.isCompleted && !!s.log && s.startedAt < record.startedAt)
      .toArray();
    return same.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }

  /** Finished sessions that kept a report, newest first */
  static async getRecentReports(limit = 20): Promise<SessionRecord[]> {
    const rows = await db.sessions.orderBy('startedAt').reverse().filter((s) => s.isCompleted && !!s.log).limit(limit).toArray();
    return rows;
  }

  static async getSessionsByFilter(sessionType?: string, filterKey?: string): Promise<SessionRecord[]> {
    let collection = db.sessions.orderBy('startedAt').reverse();
    const all = await collection.toArray();
    return all.filter(s => {
      if (sessionType && s.sessionType !== sessionType) return false;
      if (filterKey && s.filterKey !== filterKey) return false;
      return true;
    });
  }
}


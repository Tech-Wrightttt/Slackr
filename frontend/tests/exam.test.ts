import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { ExamService, customSetKey, examMinutesFor } from '../src/services/examService';
import { StatsDbService } from '../src/services/statsDb';
import { AnalyticsEngine } from '../src/services/analyticsEngine';
import { startClock } from '../src/services/examClock';

beforeEach(async () => {
  await Promise.all([db.examAttempts.clear(), db.attempts.clear(), db.topicStats.clear(), db.settings.clear(), db.sessions.clear()]);
});

describe('exam attempts', () => {
  it('locks a set after one exam, and a reset unlocks it', async () => {
    const key = 'year:2024S_FE-A';
    expect(await ExamService.getAttempt(key)).toBeUndefined();
    await ExamService.lockSet(key, '2024 Spring FE-A', 1);
    expect((await ExamService.getAttempt(key))?.sessionId).toBe(1);
    // The unique setKey refuses a second row for the same set
    await expect(db.examAttempts.add({ setKey: key, title: 'again', sessionId: 2, completedAt: '' })).rejects.toThrow();

    await ExamService.resetAttempts(key);
    expect(await ExamService.getAttempt(key)).toBeUndefined();
  });

  it('a reset keeps attempt history and sessions', async () => {
    await StatsDbService.recordAttempt('Q1', 'networking', 'a', true, 12, 3, { mode: 'exam' });
    const sessionId = await StatsDbService.saveCompletedSession({
      sessionType: 'year', filterKey: 'k', totalQuestions: 1, answeredQuestions: 1, correctAnswers: 1,
      startedAt: '2026-01-01', isCompleted: true, mode: 'exam', log: [],
    });
    await ExamService.lockSet('k', 'K', sessionId);
    expect(await ExamService.resetAttempts()).toBe(1);
    expect(await db.attempts.count()).toBe(1);
    expect(await StatsDbService.getSession(sessionId)).toBeTruthy();
  });

  it('exam answers count in analytics like practice ones', async () => {
    await StatsDbService.recordAttempt('Q1', 'networking', 'a', false, 12, 3, { mode: 'exam', choiceSwitches: 2 });
    const row = (await db.attempts.toArray())[0]!;
    expect(row).toMatchObject({ mode: 'exam', choiceSwitches: 2 });
    const rates = await AnalyticsEngine.getErrorRates();
    expect(rates.find((r) => r.topic === 'networking')).toMatchObject({ errorRate: 100 });
    expect((await db.topicStats.get('networking'))?.totalAttempts).toBe(1);
  });

  it('saves and restores the in-progress exam, so a reload resumes it', async () => {
    const progress = {
      spec: { setKey: 'k', title: 'K', questionIds: ['Q1', 'Q2'], minutes: 3, sessionType: 'custom' as const, filterKey: 'k' },
      index: 1,
      answers: { Q1: { choice: 'b', isCorrect: true, flagged: false, timeSeconds: 20, choiceSwitches: 0, touchedCorrect: true } },
      clock: startClock(180_000, 1_000),
      questionOpenedAtMs: 20_000,
      pauseCount: 0,
      startedAt: '2026-01-01T00:00:00Z',
    };
    await ExamService.saveProgress(progress);
    expect(await ExamService.loadProgress()).toEqual(progress);
    await ExamService.clearProgress();
    expect(await ExamService.loadProgress()).toBeNull();
  });

  it('defaults to the official paper durations', () => {
    expect(examMinutesFor('FE-A', 60)).toBe(90);
    expect(examMinutesFor('FE-B', 20)).toBe(100);
    expect(examMinutesFor(undefined, 10)).toBe(15);
    expect(customSetKey(['b', 'a'])).toBe(customSetKey(['a', 'b']));
  });
});

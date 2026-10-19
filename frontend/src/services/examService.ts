import { db } from '../db';
import type { ExamAttemptRecord, SessionType } from '../db/schema';
import type { ExamClock } from './examClock';

/** What an exam runs on: a fixed list of questions with a time limit */
export interface ExamSetSpec {
  /** One finished exam per setKey (e.g. "year:2024S_FE-A", "topic:networking", "custom:a,b,c") */
  setKey: string;
  title: string;
  questionIds: string[];
  minutes: number;
  sessionType: SessionType;
  filterKey: string;
}

export interface ExamAnswer {
  choice: string | null;
  /** Graded on the spot but shown only in the report */
  isCorrect?: boolean;
  flagged: boolean;
  timeSeconds: number;
  choiceSwitches: number;
  touchedCorrect: boolean;
  confidence?: number;
}

/** Everything needed to pick an exam up again after a reload */
export interface ExamProgress {
  spec: ExamSetSpec;
  index: number;
  answers: Record<string, ExamAnswer>;
  clock: ExamClock;
  /** Clock time used when the current question opened, to time each question */
  questionOpenedAtMs: number;
  pauseCount: number;
  startedAt: string;
}

const PROGRESS_KEY = 'exam_in_progress';

/** Default sitting length: the official paper durations, else 1.5 min per question */
export const examMinutesFor = (paper: string | undefined, count: number) => {
  if (paper === 'FE-A') return 90;
  if (paper === 'FE-B') return 100;
  if (paper === 'AM' || paper === 'PM') return 150;
  return Math.max(5, Math.ceil(count * 1.5));
};

/** Custom sets are keyed by their question ids, so the same picks lock together */
export const customSetKey = (ids: string[]) => `custom:${ids.slice().sort().join(',')}`;

export class ExamService {
  static async loadProgress(): Promise<ExamProgress | null> {
    const row = await db.settings.get(PROGRESS_KEY);
    return (row?.value as ExamProgress) ?? null;
  }

  static async saveProgress(progress: ExamProgress): Promise<void> {
    await db.settings.put({ key: PROGRESS_KEY, value: progress });
  }

  static async clearProgress(): Promise<void> {
    await db.settings.delete(PROGRESS_KEY);
  }

  static getAttempt(setKey: string): Promise<ExamAttemptRecord | undefined> {
    return db.examAttempts.where('setKey').equals(setKey).first();
  }

  static async lockSet(setKey: string, title: string, sessionId: number): Promise<void> {
    await db.examAttempts.put({ setKey, title, sessionId, completedAt: new Date().toISOString() });
  }

  static listAttempts(): Promise<ExamAttemptRecord[]> {
    return db.examAttempts.orderBy('completedAt').reverse().toArray();
  }

  /** Unlocks one set, or every set. Attempt rows and session reports stay, so stats history is kept. */
  static async resetAttempts(setKey?: string): Promise<number> {
    if (setKey) return db.examAttempts.where('setKey').equals(setKey).delete();
    const n = await db.examAttempts.count();
    await db.examAttempts.clear();
    return n;
  }
}

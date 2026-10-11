import Dexie, { type Table } from 'dexie';
import type { AttemptRecord, SRScheduleRecord, TopicStatRecord, SettingRecord, DeferredRecord, SessionRecord, AccountRecord } from './schema';

export class SlackrDatabase extends Dexie {
  attempts!: Table<AttemptRecord, number>;
  srSchedules!: Table<SRScheduleRecord, string>;
  topicStats!: Table<TopicStatRecord, string>;
  settings!: Table<SettingRecord, string>;
  deferred!: Table<DeferredRecord, number>;
  sessions!: Table<SessionRecord, number>;
  accounts!: Table<AccountRecord, string>;

  constructor() {
    super('SlackrDB');
    this.version(1).stores({
      attempts: '++id, questionId, topic, isCorrect, timestamp, confidence',
      srSchedules: 'questionId, algorithm, nextReviewDate, intervalDays',
      topicStats: 'topic, lastAttempt',
      settings: 'key',
    });

    this.version(2).stores({
      deferred: '++id, questionId, topic, deferredAt',
      sessions: '++id, sessionType, filterKey, startedAt, isCompleted'
    });

    // Local profile lives in its own table so JSON export/import never carries credentials
    this.version(3).stores({
      accounts: 'username',
    });
  }
}

export const db = new SlackrDatabase();

import Dexie, { type Table } from 'dexie';
import type { AttemptRecord, SRScheduleRecord, TopicStatRecord, SettingRecord } from './schema';

export class SlackrDatabase extends Dexie {
  attempts!: Table<AttemptRecord, number>;
  srSchedules!: Table<SRScheduleRecord, string>;
  topicStats!: Table<TopicStatRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('SlackrDB');
    this.version(1).stores({
      attempts: '++id, questionId, topic, isCorrect, timestamp, confidence',
      srSchedules: 'questionId, algorithm, nextReviewDate, intervalDays',
      topicStats: 'topic, lastAttempt',
      settings: 'key',
    });
  }
}

export const db = new SlackrDatabase();

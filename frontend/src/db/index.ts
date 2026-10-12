import Dexie, { type Table } from 'dexie';
import type { AttemptRecord, SRScheduleRecord, TopicStatRecord, SettingRecord, DeferredRecord, SessionRecord, AccountRecord, ReportRecord } from './schema';

export class SlackrDatabase extends Dexie {
  attempts!: Table<AttemptRecord, number>;
  srSchedules!: Table<SRScheduleRecord, string>;
  topicStats!: Table<TopicStatRecord, string>;
  settings!: Table<SettingRecord, string>;
  deferred!: Table<DeferredRecord, number>;
  sessions!: Table<SessionRecord, number>;
  accounts!: Table<AccountRecord, string>;
  reports!: Table<ReportRecord, number>;

  constructor(name = 'SlackrDB') {
    super(name);
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

    // v4 briefly persisted draw-mode sketches; v5 deletes that table (sketches are session-only now)
    this.version(4).stores({
      drawings: 'questionId, updatedAt',
    });
    this.version(5).stores({
      drawings: null,
    });

    // Bug reports and content flags: an outbox that survives offline use until the report is sent
    this.version(6).stores({
      reports: '++id, &clientId, status, kind, questionId, createdAt',
    });
  }
}

// Each device profile keeps its own study data. The device's first profile (and guests) use the
// original database, so existing progress stays where it was; profiles added later get their own.
const DEFAULT_DB = 'SlackrDB';
const ACTIVE_DATA_KEY = 'slackr_active_data';
const DATA_ID_PATTERN = /^[a-z0-9]{8,32}$/;

const readActiveDataId = (): string | null => {
  try {
    const id = localStorage.getItem(ACTIVE_DATA_KEY);
    return id && DATA_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
};

/** Data scope this page load opened: null for the shared default, else the active profile's id. */
export const activeDataId = readActiveDataId();

export const dataDbName = (dataId?: string | null) => (dataId ? `${DEFAULT_DB}_${dataId}` : DEFAULT_DB);

/** Device-wide records: the profiles on this device. */
export const registry = new SlackrDatabase(DEFAULT_DB);

/** The signed-in profile's study data (attempts, schedules, settings, ...). */
export const db = activeDataId ? new SlackrDatabase(dataDbName(activeDataId)) : registry;

/** localStorage key for per-profile data (bookmarks, custom sets) in the active scope. */
export const scopedKey = (key: string, dataId: string | null = activeDataId) => (dataId ? `${key}:${dataId}` : key);

export const BOOKMARKS_KEY = scopedKey('slackr_bookmarks');
export const CUSTOM_SETS_KEY = scopedKey('slackr_custom_quiz_sets');

const PROFILE_KEYS = ['slackr_bookmarks', 'slackr_custom_quiz_sets', 'slackr_last_cloud_sync'];

/** Deletes a non-default profile's study data from this device. Never call it for the open scope. */
export async function deleteProfileData(dataId: string) {
  if (dataId === activeDataId) throw new Error("Sign out of this profile before removing it.");
  await Dexie.delete(dataDbName(dataId));
  try {
    for (const key of PROFILE_KEYS) localStorage.removeItem(scopedKey(key, dataId));
  } catch {
    // Storage blocked: nothing to clear
  }
}

export const newDataId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('');

/** Chooses the data scope for the next page load. Returns true when it differs from this load. */
export const setActiveDataId = (dataId: string | null | undefined): boolean => {
  try {
    if (dataId) localStorage.setItem(ACTIVE_DATA_KEY, dataId);
    else localStorage.removeItem(ACTIVE_DATA_KEY);
  } catch {
    // Storage blocked: stays on the scope this page opened
    return false;
  }
  return (dataId || null) !== activeDataId;
};

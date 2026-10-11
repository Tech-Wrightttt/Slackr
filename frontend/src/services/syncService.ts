import { db } from '../db';
import type { AttemptRecord, DeferredRecord, SessionRecord, SRScheduleRecord, TopicStatRecord } from '../db/schema';
import { StatsDbService } from './statsDb';
import type { SRAlgorithm } from './srsEngine';
import { LearningResourcesService } from './learningResourcesService';
import { AnalyticalBreakdownService } from './analyticalBreakdownService';

const BOOKMARKS_KEY = 'slackr_bookmarks';
// Older builds mirrored these JSON blobs into the settings table; they live in their own block now
const LEGACY_SETTING_KEYS = new Set(['learning_resources', 'analytical_breakdowns']);
const VALID_ALGOS: SRAlgorithm[] = ['SM-2', 'FSRS', 'Custom'];

export type ImportStrategy = 'merge' | 'replace';

export interface ImportSummary {
  kind: 'backup' | 'backend' | 'learning_resources' | 'analytical_breakdowns';
  attemptsAdded: number;
  resourcesImported: number;
  breakdownsImported: number;
  algorithm: SRAlgorithm | null;
  message: string;
}

const pick = (obj: any, ...keys: string[]) => {
  for (const k of keys) if (obj?.[k] !== undefined) return obj[k];
  return undefined;
};

/** Accepts both the browser's camelCase attempts and the FastAPI backend's snake_case attempts. */
function normalizeAttempt(raw: any): AttemptRecord | null {
  const questionId = pick(raw, 'questionId', 'question_id');
  const timestamp = pick(raw, 'timestamp');
  if (!questionId || !timestamp) return null;
  const grade = pick(raw, 'grade');
  return {
    questionId: String(questionId),
    topic: String(pick(raw, 'topic') ?? 'software'),
    selectedAnswer: String(pick(raw, 'selectedAnswer', 'selected_answer') ?? ''),
    isCorrect: Boolean(pick(raw, 'isCorrect', 'is_correct')),
    timeSeconds: Number(pick(raw, 'timeSeconds', 'time_seconds') ?? 0),
    confidence: Number(pick(raw, 'confidence') ?? 3),
    ...(grade !== undefined && grade !== null ? { grade: Number(grade) } : {}),
    timestamp: String(timestamp),
  };
}

const isBrowserSchedule = (s: any): s is SRScheduleRecord =>
  s && typeof s === 'object' && typeof s.nextReviewDate === 'string' && typeof s.algorithm === 'string';

function readBookmarks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  // Must be in the DOM for Firefox; revoking too early cancels the download in some browsers
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export class SyncService {
  /** Full device snapshot: progress, schedules, bookmarks, deferred, sessions, resources, breakdowns. */
  static async buildBackup() {
    const [attempts, srSchedulesArray, topicStatsArray, settingsArray, deferred, sessions, resources, breakdowns] =
      await Promise.all([
        db.attempts.toArray(),
        db.srSchedules.toArray(),
        db.topicStats.toArray(),
        db.settings.toArray(),
        db.deferred.toArray(),
        db.sessions.toArray(),
        LearningResourcesService.loadAll(),
        AnalyticalBreakdownService.loadAll(),
      ]);

    const settings: Record<string, any> = {};
    for (const st of settingsArray) {
      if (!LEGACY_SETTING_KEYS.has(st.key)) settings[st.key] = st.value;
    }

    return {
      format: 'slackr-backup',
      exportVersion: 2,
      exportedAt: new Date().toISOString(),
      settings,
      attempts: attempts.map(({ id, ...a }) => a),
      sr_schedules: Object.fromEntries(srSchedulesArray.map((s) => [s.questionId, s])),
      topic_stats: Object.fromEntries(topicStatsArray.map((t) => [t.topic, t])),
      deferred: deferred.map(({ id, ...d }) => d),
      sessions: sessions.map(({ id, ...s }) => s),
      bookmarks: readBookmarks(),
      learning_resources: resources,
      analytical_breakdowns: breakdowns,
    };
  }

  /** Export all local data to a JSON file. Works offline. */
  static async exportLocalData(): Promise<void> {
    const payload = await this.buildBackup();
    const filename = `slackr_backup_${new Date().toISOString().split('T')[0]}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

    // Installed iOS PWAs ignore <a download>; the share sheet lets the user "Save to Files"
    const file = typeof File !== 'undefined' ? new File([blob], filename, { type: 'application/json' }) : null;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    if (isStandalone && file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'SLACKR backup' });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }
    triggerDownload(blob, filename);
  }

  /**
   * Import any SLACKR JSON file. Detects the file type automatically:
   *  - SLACKR backup (v1 or v2, from this app)
   *  - FastAPI backend export (/api/data/export, snake_case)
   *  - a standalone learning_resources.json or analytical_breakdowns.json
   * Everything is written to on-device storage, so it works with or without a connection.
   */
  static async importLocalData(jsonData: any, strategy: ImportStrategy = 'merge'): Promise<ImportSummary> {
    if (!jsonData || typeof jsonData !== 'object' || Array.isArray(jsonData)) {
      throw new Error('This file is not a SLACKR JSON export.');
    }

    const hasAttempts = Array.isArray(jsonData.attempts);

    if (!hasAttempts && LearningResourcesService.isLearningResourcesShape(jsonData)) {
      const r = await LearningResourcesService.importData(jsonData, strategy);
      return {
        kind: 'learning_resources', attemptsAdded: 0, resourcesImported: r.count, breakdownsImported: 0, algorithm: null,
        message: `Imported ${r.count} learning resource links${r.savedRemotely ? ' and saved to learning_resources.json' : ' on this device'}.`,
      };
    }

    if (!hasAttempts && AnalyticalBreakdownService.isBreakdownsShape(jsonData)) {
      const r = await AnalyticalBreakdownService.importData(jsonData, strategy);
      return {
        kind: 'analytical_breakdowns', attemptsAdded: 0, resourcesImported: 0, breakdownsImported: r.count, algorithm: null,
        message: `Imported breakdowns for ${r.count} questions${r.savedRemotely ? ' and saved to analytical_breakdowns.json' : ' on this device'}.`,
      };
    }

    const isBackendExport =
      !!jsonData.question_history || (hasAttempts && jsonData.attempts.some((a: any) => a && 'question_id' in a));
    const looksLikeBackup =
      hasAttempts || jsonData.format === 'slackr-backup' || jsonData.sr_schedules || jsonData.srSchedules;
    if (!looksLikeBackup) {
      throw new Error('Unrecognised JSON. Expected a SLACKR backup, learning_resources.json or analytical_breakdowns.json.');
    }

    const attempts = (hasAttempts ? jsonData.attempts : []).map(normalizeAttempt).filter(Boolean) as AttemptRecord[];
    const incomingSettings: Record<string, any> = jsonData.settings && typeof jsonData.settings === 'object' ? jsonData.settings : {};
    const srObj = jsonData.sr_schedules || jsonData.srSchedules || {};
    const incomingSchedules = Object.entries(srObj)
      .filter(([, s]) => isBrowserSchedule(s))
      .map(([qId, s]) => ({ ...(s as SRScheduleRecord), questionId: qId }));
    const deferred: DeferredRecord[] = Array.isArray(jsonData.deferred) ? jsonData.deferred : [];
    const sessions: SessionRecord[] = Array.isArray(jsonData.sessions) ? jsonData.sessions : [];

    let attemptsAdded = 0;

    await db.transaction('rw', [db.attempts, db.srSchedules, db.topicStats, db.settings, db.deferred, db.sessions], async () => {
      if (strategy === 'replace') {
        await Promise.all([
          db.attempts.clear(), db.srSchedules.clear(), db.topicStats.clear(),
          db.settings.clear(), db.deferred.clear(), db.sessions.clear(),
        ]);
      }

      const existingKeys = new Set((await db.attempts.toArray()).map((a) => `${a.questionId}_${a.timestamp}`));
      const newAttempts = attempts.filter((a) => {
        const key = `${a.questionId}_${a.timestamp}`;
        if (existingKeys.has(key)) return false;
        existingKeys.add(key);
        return true;
      });
      await db.attempts.bulkAdd(newAttempts);
      attemptsAdded = newAttempts.length;

      // Keep whichever schedule was reviewed most recently
      for (const s of incomingSchedules) {
        const current = await db.srSchedules.get(s.questionId);
        if (!current || (s.lastReviewDate || '') >= (current.lastReviewDate || '')) {
          await db.srSchedules.put(s);
        }
      }

      for (const [key, value] of Object.entries(incomingSettings)) {
        if (!LEGACY_SETTING_KEYS.has(key)) await db.settings.put({ key, value });
      }

      const deferredKeys = new Set((await db.deferred.toArray()).map((d) => `${d.questionId}_${d.deferredAt}`));
      await db.deferred.bulkAdd(
        deferred
          .filter((d) => d?.questionId && d?.deferredAt && !deferredKeys.has(`${d.questionId}_${d.deferredAt}`))
          .map(({ id, ...d }) => d as DeferredRecord)
      );

      const sessionKeys = new Set((await db.sessions.toArray()).map((s) => `${s.sessionType}_${s.filterKey}_${s.startedAt}`));
      await db.sessions.bulkAdd(
        sessions
          .filter((s) => s?.startedAt && !sessionKeys.has(`${s.sessionType}_${s.filterKey}_${s.startedAt}`))
          .map(({ id, ...s }) => s as SessionRecord)
      );
    });

    // Topic stats are derived data: rebuild from the merged attempt log so merges never double-count
    await this.rebuildTopicStats();

    // Backend exports carry Python-shaped SR state; recompute browser schedules from the attempt log
    const savedAlgo = await StatsDbService.getSetting<string>('spaced_repetition_algorithm', 'SM-2');
    const algorithm: SRAlgorithm = VALID_ALGOS.includes(savedAlgo as SRAlgorithm) ? (savedAlgo as SRAlgorithm) : 'SM-2';
    // Merged attempt logs also need replaying, otherwise schedules ignore the newly merged history
    if (isBackendExport || (attemptsAdded > 0 && (strategy === 'merge' || incomingSchedules.length === 0))) {
      await StatsDbService.switchAlgorithmAndReplay(algorithm);
    }

    if (Array.isArray(jsonData.bookmarks)) {
      const next = strategy === 'replace'
        ? jsonData.bookmarks
        : Array.from(new Set([...readBookmarks(), ...jsonData.bookmarks]));
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
    }

    // v1 backups stored these inside settings; v2 has dedicated blocks
    const resources = jsonData.learning_resources ?? incomingSettings.learning_resources;
    const breakdowns = jsonData.analytical_breakdowns ?? incomingSettings.analytical_breakdowns;
    const resourcesImported = resources ? (await LearningResourcesService.importData(resources, strategy)).count : 0;
    const breakdownsImported = breakdowns ? (await AnalyticalBreakdownService.importData(breakdowns, strategy)).count : 0;

    const extras = [
      resourcesImported && `${resourcesImported} resource links`,
      breakdownsImported && `${breakdownsImported} breakdowns`,
    ].filter(Boolean);

    return {
      kind: isBackendExport ? 'backend' : 'backup',
      attemptsAdded,
      resourcesImported,
      breakdownsImported,
      algorithm,
      message:
        `${strategy === 'replace' ? 'Restored' : 'Merged'} ${attemptsAdded} new attempts` +
        (extras.length ? `, ${extras.join(' and ')}` : '') +
        (isBackendExport ? ' from a server export (schedules recomputed).' : '.'),
    };
  }

  static async rebuildTopicStats(): Promise<void> {
    const attempts = await db.attempts.orderBy('timestamp').toArray();
    const stats = new Map<string, TopicStatRecord>();
    for (const a of attempts) {
      const t = stats.get(a.topic) ?? { topic: a.topic, totalAttempts: 0, correctAttempts: 0, totalTimeSeconds: 0, lastAttempt: a.timestamp };
      t.totalAttempts += 1;
      if (a.isCorrect) t.correctAttempts += 1;
      t.totalTimeSeconds += a.timeSeconds || 0;
      t.lastAttempt = a.timestamp;
      stats.set(a.topic, t);
    }
    await db.transaction('rw', db.topicStats, async () => {
      await db.topicStats.clear();
      await db.topicStats.bulkPut([...stats.values()]);
    });
  }

  /** Optional push of progress to the FastAPI companion (it expects snake_case attempts). */
  static async syncWithCompanionBackend(): Promise<boolean> {
    try {
      const backup = await this.buildBackup();
      const payload = {
        settings: backup.settings,
        sr_schedules: backup.sr_schedules,
        attempts: backup.attempts.map((a) => ({
          question_id: a.questionId,
          topic: a.topic,
          selected_answer: a.selectedAnswer,
          is_correct: a.isCorrect,
          time_seconds: a.timeSeconds,
          confidence: a.confidence,
          grade: a.grade,
          timestamp: a.timestamp,
        })),
      };
      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok && (res.headers.get('content-type') || '').includes('json');
    } catch {
      return false;
    }
  }

  static async getStorageEstimate() {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        usageMb: Math.round(((est.usage || 0) / (1024 * 1024)) * 10) / 10,
        quotaMb: Math.round(((est.quota || 0) / (1024 * 1024)) * 10) / 10,
      };
    }
    return { usageMb: 0, quotaMb: 0 };
  }
}

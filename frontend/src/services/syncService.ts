import { db } from '../db';

export class SyncService {
  /**
   * Export all local IndexedDB data to a JSON string and trigger file download.
   */
  static async exportLocalData(): Promise<void> {
    const attempts = await db.attempts.toArray();
    const srSchedulesArray = await db.srSchedules.toArray();
    const topicStatsArray = await db.topicStats.toArray();
    const settingsArray = await db.settings.toArray();

    const srSchedules: Record<string, any> = {};
    for (const s of srSchedulesArray) {
      srSchedules[s.questionId] = s;
    }

    const topicStats: Record<string, any> = {};
    for (const t of topicStatsArray) {
      topicStats[t.topic] = t;
    }

    const settings: Record<string, any> = {};
    for (const st of settingsArray) {
      settings[st.key] = st.value;
    }

    const payload = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      settings,
      attempts,
      sr_schedules: srSchedules,
      topic_stats: topicStats,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slackr_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import data from a JSON object into Dexie.js with 'replace' or 'merge' strategy.
   */
  static async importLocalData(
    jsonData: any,
    strategy: 'replace' | 'merge' = 'merge'
  ): Promise<{ attemptsAdded: number; message: string }> {
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error('Invalid JSON format');
    }

    if (strategy === 'replace') {
      await db.attempts.clear();
      await db.srSchedules.clear();
      await db.topicStats.clear();
      await db.settings.clear();
    }

    let addedCount = 0;
    const existingAttempts = await db.attempts.toArray();
    const existingKeys = new Set(existingAttempts.map((a) => `${a.questionId}_${a.timestamp}`));

    // 1. Attempts
    const attempts = Array.isArray(jsonData.attempts) ? jsonData.attempts : [];
    for (const a of attempts) {
      const key = `${a.questionId}_${a.timestamp}`;
      if (!existingKeys.has(key)) {
        const { id, ...cleanAttempt } = a;
        await db.attempts.add(cleanAttempt);
        existingKeys.add(key);
        addedCount++;
      }
    }

    // 2. SRS Schedules
    const srObj = jsonData.sr_schedules || jsonData.srSchedules || {};
    for (const [qId, sRecord] of Object.entries(srObj)) {
      if (sRecord && typeof sRecord === 'object') {
        await db.srSchedules.put({ ...(sRecord as any), questionId: qId });
      }
    }

    // 3. Topic Stats
    const tObj = jsonData.topic_stats || jsonData.topicStats || {};
    for (const [top, tRecord] of Object.entries(tObj)) {
      if (tRecord && typeof tRecord === 'object') {
        await db.topicStats.put({ ...(tRecord as any), topic: top });
      }
    }

    // 4. Settings
    const setObj = jsonData.settings || {};
    for (const [k, v] of Object.entries(setObj)) {
      await db.settings.put({ key: k, value: v });
    }

    return {
      attemptsAdded: addedCount,
      message: `Successfully imported ${addedCount} new attempts (${strategy} strategy).`,
    };
  }

  /**
   * Optional companion push to FastAPI backend.
   */
  static async syncWithCompanionBackend(): Promise<boolean> {
    try {
      const attempts = await db.attempts.toArray();
      const srSchedulesArray = await db.srSchedules.toArray();
      const topicStatsArray = await db.topicStats.toArray();
      const settingsArray = await db.settings.toArray();

      const srSchedules: Record<string, any> = {};
      for (const s of srSchedulesArray) srSchedules[s.questionId] = s;

      const topicStats: Record<string, any> = {};
      for (const t of topicStatsArray) topicStats[t.topic] = t;

      const settings: Record<string, any> = {};
      for (const st of settingsArray) settings[st.key] = st.value;

      const payload = { settings, attempts, sr_schedules: srSchedules, topic_stats: topicStats };

      const res = await fetch('/api/stats/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Query storage usage.
   */
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

  /**
   * Batch download all diagram images to CacheStorage ('slackr-images-v1').
   */
  static async downloadAllDiagrams(
    onProgress: (current: number, total: number, pct: number) => void
  ): Promise<{ total: number; downloaded: number; failed: number }> {
    const res = await fetch('/image-list.json');
    if (!res.ok) throw new Error('Could not load image manifest');

    const manifest = await res.json();
    const images: string[] = manifest.images || [];
    const total = images.length;
    if (total === 0) return { total: 0, downloaded: 0, failed: 0 };

    const cache = await caches.open('slackr-images-v1');
    let downloaded = 0;
    let failed = 0;

    // Process in batches of 10 to avoid socket exhaustion
    const batchSize = 10;
    for (let i = 0; i < total; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (url) => {
          try {
            const cached = await cache.match(url);
            if (!cached) {
              const fetchRes = await fetch(url);
              if (fetchRes.ok) {
                await cache.put(url, fetchRes);
                downloaded++;
              } else {
                failed++;
              }
            } else {
              downloaded++;
            }
          } catch {
            failed++;
          }
        })
      );
      const currentDone = Math.min(total, i + batchSize);
      onProgress(currentDone, total, Math.round((currentDone / total) * 100));
    }

    return { total, downloaded, failed };
  }

  /**
   * Clear cached diagrams.
   */
  static async clearDiagramCache(): Promise<boolean> {
    return caches.delete('slackr-images-v1');
  }
}

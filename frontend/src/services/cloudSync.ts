import { db, scopedKey } from '../db';
import { useStore } from '../store/useStore';
import { AuthService } from './authService';
import { SyncService } from './syncService';
import { AccountApi } from './accountApi';

/**
 * Online backup of the signed-in profile's study data.
 *
 * IndexedDB stays the source the app reads from. When online and signed in to a linked profile:
 *   1. pull  `user_data.data` (one JSON per user) and merge it into IndexedDB
 *   2. push  the merged device backup back to `user_data`
 * The merge is SyncService's backup merge (dedupes attempts, keeps the newest schedules), so
 * every device converges on the same data. Offline or signed out, nothing is sent.
 */

// Admin content and derived stats don't belong in a personal backup
const NOT_SYNCED = ['learning_resources', 'analytical_breakdowns', 'topic_stats', 'exportedAt'] as const;
const PUSH_DELAY_MS = 4000;
const LAST_SYNC_KEY = scopedKey('slackr_last_cloud_sync');

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastPushed = '';
let applyingRemote = false;
let started = false;

const setCloud = (patch: Parameters<ReturnType<typeof useStore.getState>['setCloud']>[0]) =>
  useStore.getState().setCloud(patch);

async function buildCloudBackup() {
  const backup: Record<string, unknown> = await SyncService.buildBackup();
  for (const key of NOT_SYNCED) delete backup[key];
  return backup;
}

/** True when the signed-in local profile is linked and the server session belongs to it. */
async function linked(): Promise<boolean> {
  if (!navigator.onLine || !useStore.getState().accountsEnabled) return false;
  await AuthService.finishPendingSignOut();
  const account = await AuthService.getAccount();
  if (!account?.remoteId) return false;
  // A leftover session from another account must never receive this device's data
  const user = await AccountApi.me();
  return user?.id === account.remoteId;
}

async function run(): Promise<void> {
  setCloud({ status: 'syncing', error: null });
  try {
    if (!(await linked())) {
      setCloud({ status: 'off' });
      return;
    }
    const remote = await AccountApi.getData();

    if (remote) {
      applyingRemote = true;
      try {
        await SyncService.importLocalData(remote, 'merge');
      } finally {
        applyingRemote = false;
      }
    }

    const backup = await buildCloudBackup();
    const json = JSON.stringify(backup);
    // Skip the upload when nothing changed since the last push from this tab
    if (json !== lastPushed || !remote) {
      await AccountApi.putData(backup);
      lastPushed = json;
    }

    const now = new Date().toISOString();
    try {
      localStorage.setItem(LAST_SYNC_KEY, now);
    } catch {
      // Storage blocked: the time only shows for this page load
    }
    setCloud({ status: 'idle', lastSyncedAt: now, error: null });
  } catch (err: any) {
    console.warn('[cloudSync] sync failed', err);
    setCloud({ status: 'error', error: err?.message || 'Sync failed' });
  }
}

export class CloudSync {
  /** Pull, merge and push now. Concurrent calls share one run. */
  static sync(): Promise<void> {
    clearTimeout(timer);
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  /** Sync a few seconds after the latest local change, batching bursts of answers. */
  static schedule(delay = PUSH_DELAY_MS) {
    if (applyingRemote) return;
    clearTimeout(timer);
    timer = setTimeout(() => void CloudSync.sync(), delay);
  }

  /** Wire automatic syncing once per app load. */
  static start() {
    if (started) return;
    started = true;
    try {
      setCloud({ lastSyncedAt: localStorage.getItem(LAST_SYNC_KEY) });
    } catch {
      // Storage blocked
    }

    const onLocalChange = () => CloudSync.schedule();
    db.attempts.hook('creating', onLocalChange);
    db.srSchedules.hook('creating', onLocalChange);
    db.srSchedules.hook('updating', onLocalChange);
    db.settings.hook('creating', onLocalChange);
    db.settings.hook('updating', onLocalChange);
    db.deferred.hook('creating', onLocalChange);

    window.addEventListener('online', () => void CloudSync.sync());
    // Bookmarks live in localStorage: flush when the user leaves or backgrounds the app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') CloudSync.schedule(0);
    });

    // Learn whether this server offers online accounts, then do the first sync
    void AccountApi.refreshStatus().then(() => CloudSync.sync());
  }

  /** Forget per-tab state when the profile changes. */
  static reset() {
    clearTimeout(timer);
    lastPushed = '';
    setCloud({ status: 'off', error: null });
  }
}

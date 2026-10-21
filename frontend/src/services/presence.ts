import { useSyncExternalStore } from 'react';
import { apiUrl } from '../config/env';
import { call } from './accountApi';

/**
 * "Online now": each open tab pings the backend every minute while visible and online. The reply is
 * how many tabs pinged in the last 2 minutes, plus the usernames of signed-in people among them.
 * Without a backend (offline, plain static host) it stays null and nothing is shown.
 */

export interface OnlineSnapshot {
  online: number;
  /** Signed-in people online, by username (guests are only counted) */
  users: string[];
}

const PING_MS = 60_000;
const CLIENT_KEY = 'slackr_presence_client';

let snapshot: OnlineSnapshot | null = null;
let timer: number | undefined;
let started = false;
const listeners = new Set<() => void>();

const setSnapshot = (next: OnlineSnapshot | null) => {
  // Same numbers and names: keep the old object so subscribers don't re-render
  if (next && snapshot && next.online === snapshot.online && next.users.join(',') === snapshot.users.join(',')) return;
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
};

// One id per tab (sessionStorage), so two tabs count as two
const clientId = (() => {
  try {
    const saved = sessionStorage.getItem(CLIENT_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();

const active = () => document.visibilityState === 'visible' && navigator.onLine;

async function ping() {
  if (!active()) return;
  try {
    const res = await call<{ online: number; users?: string[] }>('POST', '/api/presence', { client_id: clientId });
    setSnapshot({ online: res.online, users: res.users ?? [] });
  } catch {
    setSnapshot(null);
  }
}

function leave() {
  // sendBeacon survives the tab closing; a JSON Blob keeps the body parseable by FastAPI
  navigator.sendBeacon?.(
    apiUrl('/api/presence/leave'),
    new Blob([JSON.stringify({ client_id: clientId })], { type: 'application/json' })
  );
}

function schedule() {
  window.clearInterval(timer);
  timer = window.setInterval(ping, PING_MS);
}

export const Presence = {
  start() {
    if (started || typeof window === 'undefined') return;
    started = true;
    void ping();
    schedule();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void ping();
        schedule();
      } else {
        window.clearInterval(timer);
      }
    });
    window.addEventListener('online', () => void ping());
    window.addEventListener('offline', () => setSnapshot(null));
    window.addEventListener('pagehide', leave);
  },
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Who has SLACKR open right now, or null when unknown (offline / no backend). */
export const useOnlineNow = () => useSyncExternalStore(subscribe, () => snapshot, () => null);

/** People with SLACKR open right now, or null when unknown. */
export const useOnlineCount = () => useOnlineNow()?.online ?? null;

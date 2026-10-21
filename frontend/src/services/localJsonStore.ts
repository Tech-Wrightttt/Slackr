/**
 * Local-first persistence for user-editable JSON (learning resources, analytical breakdowns).
 *
 * - Every save lands in localStorage first, so it works with no connection and no backend.
 * - A "pending" flag marks local edits the server hasn't accepted yet; while set, the local copy
 *   is the source of truth and is never overwritten by the (older) server/static copy.
 * - Pending edits are pushed to the API on load and whenever the browser comes back online.
 */
export interface LocalJsonStoreOptions<T> {
  storageKey: string;
  apiUrl: string;
  staticUrl: string;
  empty: () => T;
}

export async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    // Static hosts answer unknown /api routes with index.html — treat that as "no API"
    if (!res.ok || !type.includes('json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export class LocalJsonStore<T> {
  private opts: LocalJsonStoreOptions<T>;
  private pendingKey: string;
  lastSavedRemotely = false;

  constructor(opts: LocalJsonStoreOptions<T>) {
    this.opts = opts;
    this.pendingKey = `${opts.storageKey}_pending`;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flushPending());
    }
  }

  readLocal(): T | null {
    try {
      const raw = localStorage.getItem(this.opts.storageKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  hasPending(): boolean {
    return localStorage.getItem(this.pendingKey) === '1';
  }

  private writeLocal(data: T) {
    try {
      localStorage.setItem(this.opts.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn(`Could not write ${this.opts.storageKey} to localStorage`, e);
    }
  }

  /** Load: pending local edits win; otherwise newest remote (API → static bundle) → local cache. */
  async load(): Promise<T> {
    const local = this.readLocal();
    if (this.hasPending() && local) {
      void this.flushPending();
      return local;
    }
    const remote =
      (await fetchJson<T>(this.opts.apiUrl)) ?? (await fetchJson<T>(this.opts.staticUrl));
    const result = remote ?? local ?? this.opts.empty();
    this.writeLocal(result);
    return result;
  }

  /** Save locally (always succeeds offline), then try to persist to the project JSON via the API. */
  async save(data: T): Promise<boolean> {
    this.writeLocal(data);
    localStorage.setItem(this.pendingKey, '1');
    this.lastSavedRemotely = await this.push(data);
    return this.lastSavedRemotely;
  }

  async flushPending(): Promise<boolean> {
    if (!this.hasPending()) return true;
    const local = this.readLocal();
    return local ? this.push(local) : true;
  }

  private async push(data: T): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
    try {
      const res = await fetch(this.opts.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.includes('json')) {
        localStorage.removeItem(this.pendingKey);
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        // Only the admin edits public content: drop the refused local edit so the shared copy loads again
        localStorage.removeItem(this.pendingKey);
      }
    } catch {
      // offline or no backend: stays pending, retried on reconnect
    }
    return false;
  }
}

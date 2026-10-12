import { apiUrl } from '../config/env';
import { useStore } from '../store/useStore';

/**
 * The browser's only route to online accounts, study-data backup and bug reports: SLACKR's own
 * FastAPI (`/api/account/*`, `/api/reports`). The backend talks to Supabase; the session lives in
 * httpOnly cookies, so no token or database key is ever visible to page scripts.
 */

export interface OnlineUser {
  id: string;
  email: string;
  username: string | null;
}

export class AccountApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
  /** Server unreachable (offline, backend down): callers fall back to the device copy */
  get isNetwork() {
    return this.status === 0;
  }
}

const ENABLED_KEY = 'slackr_accounts_enabled';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AccountApiError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = payload?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? 'Check the form and try again.' : 'Something went wrong.';
    // 502/503/504 from a proxy with no backend behind it count as unreachable
    throw new AccountApiError(message, res.status >= 502 && !detail ? 0 : res.status);
  }
  return payload as T;
}

export const AccountApi = {
  /** Asks the backend whether online accounts are configured; remembered for offline launches. */
  async refreshStatus(): Promise<boolean> {
    try {
      const { enabled } = await call<{ enabled: boolean }>('GET', '/api/account/status');
      try {
        localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
      } catch {
        // Storage blocked: status lasts for this page load
      }
      useStore.getState().setAccountsEnabled(enabled);
      return enabled;
    } catch {
      return useStore.getState().accountsEnabled;
    }
  },

  usernameAvailable: (name: string) =>
    call<{ available: boolean }>('GET', `/api/account/username-available?name=${encodeURIComponent(name)}`).then(
      (r) => r.available
    ),

  signUp: (username: string, email: string, password: string) =>
    call<{ user: OnlineUser; needsConfirmation: boolean }>('POST', '/api/account/signup', { username, email, password }),

  signIn: (email: string, password: string) =>
    call<{ user: OnlineUser }>('POST', '/api/account/signin', { email, password }).then((r) => r.user),

  signOut: () => call<{ ok: boolean }>('POST', '/api/account/signout'),

  /** The signed-in online user, or null when there is no online session. */
  me: () =>
    call<{ user: OnlineUser }>('GET', '/api/account/me').then(
      (r) => r.user,
      (err: AccountApiError) => {
        if (err.status === 401) return null;
        throw err;
      }
    ),

  getData: () => call<{ data: Record<string, unknown> | null }>('GET', '/api/account/data').then((r) => r.data),

  putData: (data: Record<string, unknown>) => call<{ ok: boolean }>('PUT', '/api/account/data', { data }),

  submitReport: (report: Record<string, unknown>) => call<{ ok: boolean }>('POST', '/api/reports', report),
};

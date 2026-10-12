import { registry, newDataId, setActiveDataId, deleteProfileData } from '../db';
import type { AccountRecord } from '../db/schema';
import { AccountApi, AccountApiError, type OnlineUser } from './accountApi';
import { passwordProblem } from './passwordPolicy';

// A device can hold any number of profiles. Each has two layers:
// - Local (always): username + PBKDF2 password hash in IndexedDB, so sign-in works offline.
//   The password only locks this browser's UI; it does not encrypt the study data.
// - Online (optional): an account (email + password) linked to the local profile, used to back up
//   and sync study data across devices. Handled by the FastAPI backend (/api/account), which talks to
//   Supabase server-side and keeps the session in httpOnly cookies.
// Each profile's study data lives in its own scope (see db/index.ts); switching profile reloads the app.
const SESSION_KEY = 'slackr_session';
// sessionStorage: set once the auth screen has been shown this launch, so Skip sticks until the app is reopened
const AUTH_PROMPTED_KEY = 'slackr_auth_prompted';
// OWASP 2023 guidance for PBKDF2-SHA256; older profiles were hashed with 150,000 and are upgraded on sign-in
const PBKDF2_ITERATIONS = 600_000;
const LEGACY_ITERATIONS = 150_000;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure context required: open SLACKR over HTTPS or localhost to use profiles.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

async function newPasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    passwordHash: await hashPassword(password, salt, PBKDF2_ITERATIONS),
    salt: toHex(salt),
    iterations: PBKDF2_ITERATIONS,
  };
}

// Constant-time compare so the check doesn't leak how many leading chars matched
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const sameName = (a: string, b: string) => a.toLowerCase() === b.trim().toLowerCase();

async function passwordMatches(account: AccountRecord, password: string) {
  const hash = await hashPassword(password, fromHex(account.salt), account.iterations ?? LEGACY_ITERATIONS);
  return safeEqual(hash, account.passwordHash);
}

const readSession = (): string | null => {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

const writeSession = (username: string | null) => {
  try {
    if (username) localStorage.setItem(SESSION_KEY, username);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: session lasts for this page load only
  }
};

// Set when sign-out happened offline, so the server session is ended once a connection returns
const PENDING_SIGNOUT_KEY = 'slackr_pending_signout';

const endOnlineSession = () =>
  AccountApi.signOut().catch(() => {
    try {
      localStorage.setItem(PENDING_SIGNOUT_KEY, '1');
    } catch {
      // Storage blocked: the cookie expires on its own
    }
  });

/** Server unreachable, or this server has no online accounts: callers fall back to the device copy */
const serverUnavailable = (err: unknown) => err instanceof AccountApiError && (err.isNetwork || err.status === 503);

const WRONG_LOGIN = 'Incorrect username/email or password.';

/** Profiles added after the first get their own data scope; the first keeps the device's existing data. */
const nextDataId = (profiles: AccountRecord[]) => (profiles.some((p) => !p.dataId) ? newDataId() : undefined);

export interface SignUpInput {
  username: string;
  password: string;
  /** When given (and online), also creates the online account */
  email?: string;
}

export interface AuthResult {
  username: string;
  /** The profile's data lives in another scope: reload the app to open it */
  reload: boolean;
}

export interface SignUpResult extends AuthResult {
  /** Online account created but the project requires email confirmation before first sign-in */
  needsConfirmation: boolean;
}

export class AuthService {
  /** Every profile saved on this device. */
  static listProfiles(): Promise<AccountRecord[]> {
    return registry.accounts.toArray();
  }

  /** The signed-in profile, if any. */
  static async getAccount(): Promise<AccountRecord | undefined> {
    const session = readSession();
    return session ? registry.accounts.get(session) : undefined;
  }

  /** Resolves the signed-in username, or null. Also reports whether any profile exists. */
  static async restore(): Promise<{ hasAccount: boolean; username: string | null }> {
    const [count, account] = await Promise.all([registry.accounts.count(), this.getAccount()]);
    if (!account && readSession()) writeSession(null);
    // Storage got out of step (e.g. a profile removed in another tab): reopen the right data scope
    if (setActiveDataId(account?.dataId)) {
      window.location.reload();
      return new Promise(() => {});
    }
    return { hasAccount: count > 0, username: account?.username ?? null };
  }

  private static activate(account: AccountRecord): AuthResult {
    writeSession(account.username);
    return { username: account.username, reload: setActiveDataId(account.dataId) };
  }

  /**
   * Adds a profile to this device and, when an email is given, creates the online account too.
   * The device's first profile keeps the progress already on it; later profiles start fresh.
   */
  static async signUp({ username, password, email }: SignUpInput): Promise<SignUpResult> {
    const name = username.trim();
    const mail = email?.trim().toLowerCase() || '';
    if (!USERNAME_PATTERN.test(name)) {
      throw new Error('Username must be 3–24 characters: letters, numbers, dot, dash or underscore.');
    }
    const problem = passwordProblem(password, name);
    if (problem) throw new Error(problem);
    if (mail && !EMAIL_PATTERN.test(mail)) throw new Error('Enter a valid email address.');

    const profiles = await this.listProfiles();
    if (profiles.some((p) => sameName(p.username, name))) {
      throw new Error(`"${name}" is already a profile on this device. Sign in instead.`);
    }

    let online: { user: OnlineUser; needsConfirmation: boolean } | undefined;
    if (mail) {
      if (!navigator.onLine) throw new Error("You're offline. Connect to create the online account, or leave email empty.");
      // The server checks the username, creates the account and starts the session
      online = await AccountApi.signUp(name, mail, password);
    }

    const account: AccountRecord = {
      username: name,
      ...(await newPasswordRecord(password)),
      createdAt: new Date().toISOString(),
      dataId: nextDataId(profiles),
      ...(online ? { email: mail, remoteId: online.user.id } : {}),
    };
    await registry.accounts.add(account);
    // With email confirmation on, the user signs in after confirming; otherwise they're in now
    if (online?.needsConfirmation) return { username: name, reload: false, needsConfirmation: true };
    return { ...this.activate(account), needsConfirmation: false };
  }

  /** Links the signed-in device-only profile to a new online account. */
  static async linkOnline(email: string, currentPassword: string, newPassword: string): Promise<{ needsConfirmation: boolean }> {
    const account = await this.getAccount();
    if (!account) throw new Error('Sign in first.');
    if (account.remoteId) throw new Error('This profile is already linked to an online account.');
    const mail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(mail)) throw new Error('Enter a valid email address.');
    if (!(await passwordMatches(account, currentPassword))) throw new Error('Current password is incorrect.');
    const problem = passwordProblem(newPassword, account.username);
    if (problem) throw new Error(problem);

    const res = await AccountApi.signUp(account.username, mail, newPassword);
    // One password everywhere: the device copy follows the online one
    await registry.accounts.update(account.username, {
      ...(await newPasswordRecord(newPassword)),
      email: mail,
      remoteId: res.user.id,
    });
    return { needsConfirmation: res.needsConfirmation };
  }

  /**
   * `identifier` is a username or an email. Online accounts are checked by the server, so they work on
   * any device; device-only profiles, and any profile while offline, are checked against the device copy.
   */
  static async signIn(identifier: string, password: string): Promise<AuthResult> {
    const id = identifier.trim();
    if (!id || !password) throw new Error('Enter your username or email and password.');
    const profiles = await this.listProfiles();
    const local = profiles.find((p) => sameName(p.username, id) || (p.email && sameName(p.email, id)));

    if (!local || local.remoteId) {
      if (navigator.onLine) {
        try {
          // The device already knows a linked profile's email, so the server needn't look the username up
          return await this.completeOnlineSignIn(await AccountApi.signIn(local?.email ?? id, password), password);
        } catch (err) {
          if (!local || !serverUnavailable(err)) throw err;
          // Server unreachable: fall through to the device copy
        }
      } else if (!local) {
        throw new Error("You're offline. Signing in to an account that isn't on this device yet needs a connection.");
      }
    }

    if (!local || !(await passwordMatches(local, password))) throw new Error(WRONG_LOGIN);
    if ((local.iterations ?? LEGACY_ITERATIONS) < PBKDF2_ITERATIONS) {
      await registry.accounts.update(local.username, await newPasswordRecord(password));
    }
    return this.activate(local);
  }

  /** After the server accepted the password: find or add this account's device profile and open it. */
  static async completeOnlineSignIn(user: OnlineUser, password: string): Promise<AuthResult> {
    const profiles = await this.listProfiles();
    const username = user.username || user.email.split('@')[0]!.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24);
    let local = profiles.find((p) => p.remoteId === user.id);

    if (!local) {
      const namesake = profiles.find((p) => sameName(p.username, username));
      // A device-only profile with the same name is the same person only if it has the same password
      if (namesake && !namesake.remoteId && (await passwordMatches(namesake, password))) {
        local = namesake;
      } else if (namesake) {
        await endOnlineSession();
        throw new Error(
          `This device has a different profile named "${namesake.username}". Remove it from this device (Forgot password?) and sign in again.`
        );
      }
    }

    // The online password is the source of truth: refresh the device copy so offline sign-in matches
    const record = { ...(await newPasswordRecord(password)), email: user.email.toLowerCase(), remoteId: user.id };
    if (local) {
      await registry.accounts.update(local.username, record);
      return this.activate(local);
    }
    const account: AccountRecord = { username, ...record, createdAt: new Date().toISOString(), dataId: nextDataId(profiles) };
    await registry.accounts.add(account);
    return this.activate(account);
  }

  /** True when a signed-out visitor hasn't seen the sign-up / sign-in screen yet this launch. */
  static shouldPromptThisLaunch(): boolean {
    try {
      return sessionStorage.getItem(AUTH_PROMPTED_KEY) !== '1';
    } catch {
      return false;
    }
  }

  static markPromptedThisLaunch() {
    try {
      sessionStorage.setItem(AUTH_PROMPTED_KEY, '1');
    } catch {
      // Storage blocked: the prompt may show again on the next navigation, which is harmless
    }
  }

  /** Signs out to guest mode. Returns true when the app must reload to leave the profile's data scope. */
  static signOut(): boolean {
    writeSession(null);
    void endOnlineSession();
    return setActiveDataId(null);
  }

  /** Ends a server session left over from an offline sign-out. Cheap no-op otherwise. */
  static async finishPendingSignOut() {
    try {
      if (localStorage.getItem(PENDING_SIGNOUT_KEY) !== '1') return;
      await AccountApi.signOut();
      localStorage.removeItem(PENDING_SIGNOUT_KEY);
    } catch {
      // Still offline or storage blocked: try again next time
    }
  }

  /**
   * Removes a profile from this device (only while signed out). The device's first profile leaves its
   * progress in place for guests; later profiles' progress is deleted with them. Online accounts and
   * their backups are untouched: signing in again restores them.
   */
  static async removeProfile(username: string) {
    const account = await registry.accounts.get(username);
    if (!account) return;
    if (readSession() === account.username) throw new Error('Sign out of this profile before removing it.');
    if (account.dataId) await deleteProfileData(account.dataId);
    await registry.accounts.delete(account.username);
  }
}

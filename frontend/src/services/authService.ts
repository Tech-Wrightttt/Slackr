import { db } from '../db';
import type { AccountRecord } from '../db/schema';
import { AccountApi, AccountApiError, type OnlineUser } from './accountApi';

// Profiles have two layers:
// - Local (always): username + PBKDF2 password hash in IndexedDB, so sign-in works offline.
//   The password only locks this browser's UI; it does not encrypt the study data.
// - Online (optional): an account (email + password) linked to the local profile, used to back up
//   and sync study data across devices. Handled by the FastAPI backend (/api/account), which talks to
//   Supabase server-side and keeps the session in httpOnly cookies.
const SESSION_KEY = 'slackr_session';
// sessionStorage: set once the auth screen has been shown this launch, so Skip sticks until the app is reopened
const AUTH_PROMPTED_KEY = 'slackr_auth_prompted';
const PBKDF2_ITERATIONS = 150_000;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
export const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

async function hashPassword(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure context required: open SLACKR over HTTPS or localhost to use profiles.');
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

async function newPasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { passwordHash: await hashPassword(password, salt), salt: toHex(salt) };
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
  return safeEqual(await hashPassword(password, fromHex(account.salt)), account.passwordHash);
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

const isNetworkError = (err: unknown) => err instanceof AccountApiError && err.isNetwork;

export interface SignUpInput {
  username: string;
  password: string;
  /** When given (and online), also creates the online account */
  email?: string;
}

export interface SignUpResult {
  username: string;
  /** Online account created but the project requires email confirmation before first sign-in */
  needsConfirmation: boolean;
}

export class AuthService {
  static async getAccount(): Promise<AccountRecord | undefined> {
    return db.accounts.toCollection().first();
  }

  /** Resolves the signed-in username, or null. Also reports whether a profile exists. */
  static async restore(): Promise<{ hasAccount: boolean; username: string | null }> {
    const account = await this.getAccount();
    if (!account) return { hasAccount: false, username: null };
    const session = readSession();
    return { hasAccount: true, username: session === account.username ? account.username : null };
  }

  /**
   * Creates the profile on this device and, when an email is given and the app is online, the online
   * account too. If this device already has the same profile (local-only), it is linked online instead.
   */
  static async signUp({ username, password, email }: SignUpInput): Promise<SignUpResult> {
    const name = username.trim();
    const mail = email?.trim().toLowerCase() || '';
    if (!USERNAME_PATTERN.test(name)) {
      throw new Error('Username must be 3–24 characters: letters, numbers, dot, dash or underscore.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (mail && !EMAIL_PATTERN.test(mail)) throw new Error('Enter a valid email address.');

    const existing = await this.getAccount();
    if (existing && !sameName(existing.username, name)) {
      throw new Error(`This device already has the profile "${existing.username}". Sign in instead.`);
    }
    if (existing && !mail) throw new Error('A profile already exists on this device. Sign in instead.');
    if (existing && !(await passwordMatches(existing, password))) {
      throw new Error(`Enter the current password of "${existing.username}" to link it online.`);
    }
    if (existing?.remoteId) throw new Error('This profile is already linked to an online account.');

    let remoteId: string | undefined;
    let needsConfirmation = false;
    if (mail) {
      if (!navigator.onLine) throw new Error("You're offline. Connect to create the online account, or leave email empty.");
      // The server checks the username, creates the account and starts the session
      const res = await AccountApi.signUp(name, mail, password);
      remoteId = res.user.id;
      needsConfirmation = res.needsConfirmation;
    }

    if (existing) {
      await db.accounts.update(existing.username, { email: mail, remoteId });
    } else {
      await db.accounts.add({
        username: name,
        ...(await newPasswordRecord(password)),
        createdAt: new Date().toISOString(),
        ...(mail ? { email: mail, remoteId } : {}),
      });
    }
    // With email confirmation on, the user signs in after confirming; otherwise they're in now
    if (!needsConfirmation) writeSession(existing?.username ?? name);
    return { username: existing?.username ?? name, needsConfirmation };
  }

  /**
   * `identifier` is a username or an email. Online (and linked), the password is checked by the server
   * and the local copy is refreshed; offline, it is checked against the local hash.
   */
  static async signIn(identifier: string, password: string): Promise<string> {
    const id = identifier.trim();
    const isEmail = id.includes('@');
    const local = await this.getAccount();
    const email = isEmail ? id.toLowerCase() : local && sameName(local.username, id) ? local.email : undefined;

    if (email && navigator.onLine) {
      try {
        return this.completeOnlineSignIn(await AccountApi.signIn(email, password), email, password, local);
      } catch (err) {
        // Server unreachable: fall through to the device check
        if (!isNetworkError(err)) throw err;
      }
    }

    if (!local) {
      throw new Error(
        isEmail
          ? "You're offline. Signing in with email on a new device needs a connection."
          : 'No profile on this device yet. Create one, or sign in with your email.'
      );
    }
    const nameOk = isEmail ? local.email === id.toLowerCase() : sameName(local.username, id);
    // Same message for both failures so the form doesn't confirm which part was wrong
    if (!nameOk || !(await passwordMatches(local, password))) {
      throw new Error('Incorrect email/username or password.');
    }
    writeSession(local.username);
    return local.username;
  }

  private static async completeOnlineSignIn(
    user: OnlineUser,
    email: string,
    password: string,
    local: AccountRecord | undefined
  ): Promise<string> {
    const username = user.username || email.split('@')[0]!.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24);

    // Study data on a device isn't split per user, so never merge another person's profile into it
    if (local && !sameName(local.username, username)) {
      await endOnlineSession();
      throw new Error(
        `This device has the profile "${local.username}". Sign in to it, or remove it (Forgot password?) first.`
      );
    }

    // The online password is the source of truth: refresh the offline copy so it matches
    const record = await newPasswordRecord(password);
    if (local) {
      await db.accounts.update(local.username, { ...record, email, remoteId: user.id });
      writeSession(local.username);
      return local.username;
    }
    await db.accounts.add({ username, ...record, createdAt: new Date().toISOString(), email, remoteId: user.id });
    writeSession(username);
    return username;
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

  static signOut() {
    writeSession(null);
    void endOnlineSession();
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

  /** Removes the profile only. Attempts, schedules and settings stay on the device. */
  static async removeProfile() {
    await db.accounts.clear();
    writeSession(null);
    void endOnlineSession();
  }
}

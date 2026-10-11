import { db } from '../db';
import type { AccountRecord } from '../db/schema';

// Local, device-only profile. There is no server: the password only locks this
// browser's UI, it does not encrypt the study data stored in IndexedDB.
const SESSION_KEY = 'slackr_session';
const PBKDF2_ITERATIONS = 150_000;

export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
export const MIN_PASSWORD_LENGTH = 6;

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

// Constant-time compare so the check doesn't leak how many leading chars matched
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

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

  static async signUp(username: string, password: string): Promise<string> {
    const name = username.trim();
    if (!USERNAME_PATTERN.test(name)) {
      throw new Error('Username must be 3–24 characters: letters, numbers, dot, dash or underscore.');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (await this.getAccount()) {
      throw new Error('A profile already exists on this device. Sign in instead.');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await db.accounts.add({
      username: name,
      passwordHash: await hashPassword(password, salt),
      salt: toHex(salt),
      createdAt: new Date().toISOString(),
    });
    writeSession(name);
    return name;
  }

  static async signIn(username: string, password: string): Promise<string> {
    const account = await this.getAccount();
    if (!account) throw new Error('No profile on this device yet. Create one first.');
    const hash = await hashPassword(password, fromHex(account.salt));
    // Same message for both failures so the form doesn't confirm which part was wrong
    if (account.username.toLowerCase() !== username.trim().toLowerCase() || !safeEqual(hash, account.passwordHash)) {
      throw new Error('Incorrect username or password.');
    }
    writeSession(account.username);
    return account.username;
  }

  static signOut() {
    writeSession(null);
  }

  /** Removes the profile only. Attempts, schedules and settings stay on the device. */
  static async removeProfile() {
    await db.accounts.clear();
    writeSession(null);
  }
}

/**
 * Password rules for new passwords (sign-up, linking online, reset). Mirrored by the backend
 * (backend/routers/account.py), which is the check that counts. Existing passwords still sign in.
 */

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const PASSWORD_RULES: { id: string; label: string; test: (pw: string) => boolean }[] = [
  { id: 'length', label: `${PASSWORD_MIN}+ characters`, test: (pw) => pw.length >= PASSWORD_MIN },
  { id: 'lower', label: 'Lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'upper', label: 'Uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'digit', label: 'Number', test: (pw) => /[0-9]/.test(pw) },
  { id: 'symbol', label: 'Symbol (! ? # @ …)', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

// Words that make an otherwise "complex" password easy to guess (Password1!, Slackr2024#, ...)
const COMMON_PARTS = ['password', 'passw0rd', 'qwerty', '123456', 'letmein', 'iloveyou', 'welcome', 'admin', 'slackr', 'philnits'];

/** First problem with a new password, or null when it meets every rule. */
export function passwordProblem(password: string, username = ''): string | null {
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const missing = PASSWORD_RULES.filter((r) => !r.test(password));
  if (missing.length) {
    return `Password needs: ${missing.map((r) => r.label.toLowerCase()).join(', ')}.`;
  }
  const lower = password.toLowerCase();
  const name = username.trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) return "Don't use your username in the password.";
  if (COMMON_PARTS.some((w) => lower.includes(w))) return 'That password is too easy to guess. Avoid common words like "password".';
  return null;
}

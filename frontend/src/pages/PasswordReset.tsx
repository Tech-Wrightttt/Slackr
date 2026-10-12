import React, { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../store/useStore';
import { AccountApi } from '../services/accountApi';
import { AuthService } from '../services/authService';
import { CloudSync } from '../services/cloudSync';
import { passwordProblem } from '../services/passwordPolicy';
import { PasswordChecklist } from '../components/PasswordChecklist';

const inputClass =
  'w-full min-h-[46px] rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3.5 py-2.5 text-base sm:text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/25';
const labelClass = 'font-mono-code text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant';
const primaryButton =
  'press-scale min-h-[46px] w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2';

const Shell: React.FC<{ eyebrow: string; title: string; subtitle: string; children: React.ReactNode }> = ({
  eyebrow,
  title,
  subtitle,
  children,
}) => (
  <main className="min-h-dvh w-full bg-surface px-4 py-10 sm:py-16 flex justify-center">
    <div className="w-full max-w-sm flex flex-col gap-6 enter-rise">
      <Link
        to="/signin"
        className="press-scale -ml-2 inline-flex w-fit min-h-[40px] items-center gap-1 rounded-full px-2 text-xs font-semibold text-on-surface-variant hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>
        Back to sign in
      </Link>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono-timer text-[11px] font-semibold tracking-wider text-primary">{eyebrow}</span>
        <h1 className="font-display-lg text-3xl font-bold tracking-tight text-on-surface">{title}</h1>
        <p className="text-sm leading-relaxed text-on-surface-variant">{subtitle}</p>
      </div>
      {children}
    </div>
  </main>
);

const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <div
    role="alert"
    className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-xs leading-relaxed text-on-error-container dark:bg-error/10 dark:text-error"
  >
    <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden="true">error</span>
    <span>{message}</span>
  </div>
);

/** Removes profiles from this device, e.g. a device-only profile whose password is forgotten. */
const DeviceProfiles: React.FC = () => {
  const { currentUser, setAuth } = useStore();
  const profiles = useLiveQuery(() => AuthService.listProfiles(), []) ?? [];
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!profiles.length) return null;

  const remove = async (username: string) => {
    setError(null);
    try {
      await AuthService.removeProfile(username);
      setConfirming(null);
      setAuth({ hasAccount: profiles.length > 1 });
    } catch (err: any) {
      setError(err?.message || 'Could not remove the profile.');
    }
  };

  return (
    <section aria-labelledby="device-profiles-title" className="flex flex-col gap-3 border-t border-outline-variant/30 pt-6">
      <h2 id="device-profiles-title" className="text-sm font-semibold text-on-surface">
        Profiles on this device
      </h2>
      <p className="text-xs leading-relaxed text-on-surface-variant">
        A device-only profile (no email) can't be reset. Remove it here and create a new one. Profiles with an online
        account can be removed too; signing in again restores them from the backup.
      </p>
      {error && <ErrorNote message={error} />}
      <ul className="flex flex-col gap-2">
        {profiles.map((p) => (
          <li key={p.username} className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">
                {p.remoteId ? 'cloud_done' : 'person'}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{p.username}</span>
              <span className="font-mono-code text-[10px] text-on-surface-variant">{p.remoteId ? 'online' : 'device only'}</span>
              {confirming !== p.username && p.username !== currentUser && (
                <button
                  type="button"
                  onClick={() => setConfirming(p.username)}
                  className="press-scale min-h-[40px] rounded-lg px-3 text-xs font-semibold text-error hover:bg-error/10 cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            {confirming === p.username && (
              <div role="alertdialog" aria-label={`Remove ${p.username}?`} className="flex flex-col gap-2 text-xs leading-relaxed text-on-surface-variant">
                <p>
                  {p.dataId
                    ? `Removes "${p.username}" and its progress on this device.`
                    : `Removes "${p.username}". Its progress stays on this device for guest use.`}
                  {p.remoteId ? ' The online account and backup are kept.' : ' This cannot be undone.'}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="press-scale min-h-[40px] rounded-lg px-3 bg-surface-container text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(p.username)}
                    className="press-scale min-h-[40px] rounded-lg px-3 bg-error/15 border border-error/30 text-error font-semibold cursor-pointer"
                  >
                    Remove profile
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export const ForgotPassword: React.FC = () => {
  const id = useId();
  const isOffline = useStore((s) => s.isOffline);
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError('Enter the email of your account.');
    setError(null);
    setPending(true);
    try {
      await AccountApi.forgotPassword(mail);
      setSentTo(mail);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Shell
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your password"
      subtitle="Enter the email of your online account. We'll send a link to choose a new password."
    >
      {sentTo ? (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm leading-relaxed text-on-surface">
          If <strong>{sentTo}</strong> has an account, a reset link is on its way. Open it on this device. Check spam if
          it doesn't arrive in a few minutes.
        </p>
      ) : isOffline ? (
        <p className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-xs leading-relaxed text-on-surface-variant">
          You're offline. Connect to send a reset link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className={labelClass}>
              Email
            </label>
            <input
              id={`${id}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
              className={inputClass}
            />
          </div>
          {error && <ErrorNote message={error} />}
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending && <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span>}
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      <DeviceProfiles />
    </Shell>
  );
};

/** Reads the tokens Supabase puts in the reset link's #fragment. */
const readRecoveryTokens = () => {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token') ?? '',
    linkError: params.get('error_description'),
  };
};

export const ResetPassword: React.FC = () => {
  const id = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useStore((s) => s.setAuth);
  const [{ accessToken, refreshToken, linkError }] = useState(readRecoveryTokens);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the one-time tokens out of browser history and screenshots
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', location.pathname);
  }, [location.pathname]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || !accessToken) return;
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('Passwords do not match.');
    setError(null);
    setPending(true);
    try {
      const user = await AccountApi.resetPassword(accessToken, refreshToken, password);
      const result = await AuthService.completeOnlineSignIn(user, password);
      if (result.reload) {
        window.location.replace('/');
        return;
      }
      setAuth({ hasAccount: true, currentUser: result.username });
      CloudSync.reset();
      void CloudSync.sync();
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
      setPending(false);
    }
  };

  if (!accessToken) {
    return (
      <Shell
        eyebrow="ACCOUNT RECOVERY"
        title="Link expired"
        subtitle={linkError ? `${linkError}.` : 'This reset link is invalid or was already used.'}
      >
        <Link to="/forgot-password" className={primaryButton}>
          Send a new link
        </Link>
      </Shell>
    );
  }

  return (
    <Shell eyebrow="ACCOUNT RECOVERY" title="Choose a new password" subtitle="It replaces your old password on every device.">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-password`} className={labelClass}>
            New password
          </label>
          <input
            id={`${id}-password`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            required
            aria-describedby={`${id}-rules`}
            className={inputClass}
          />
          <PasswordChecklist id={`${id}-rules`} password={password} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-confirm`} className={labelClass}>
            Confirm password
          </label>
          <input
            id={`${id}-confirm`}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            className={inputClass}
          />
        </div>
        {error && <ErrorNote message={error} />}
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending && <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span>}
          {pending ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </Shell>
  );
};

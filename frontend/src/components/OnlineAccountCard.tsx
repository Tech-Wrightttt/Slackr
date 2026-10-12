import React, { useEffect, useId, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useStore } from '../store/useStore';
import { AuthService } from '../services/authService';
import { CloudSync } from '../services/cloudSync';
import { passwordProblem } from '../services/passwordPolicy';
import { PasswordChecklist } from './PasswordChecklist';

const formatWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never';

/**
 * Profile → online backup. Linked profiles see their email, sync status and "Sync now";
 * device-only profiles can link an online account (email, current password, new account password).
 */
export const OnlineAccountCard: React.FC = () => {
  const uid = useId();
  const { isOffline, cloud, accountsEnabled, currentUser } = useStore();
  const account = useLiveQuery(() => AuthService.getAccount(), [currentUser]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Show a fresh status when the card opens
  useEffect(() => {
    if (account?.remoteId && !isOffline) void CloudSync.sync();
  }, [account?.remoteId, isOffline]);

  if (!account || (!accountsEnabled && !account.remoteId)) return null;
  const linked = !!account.remoteId;

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { needsConfirmation } = await AuthService.linkOnline(email, password, newPassword);
      setPassword('');
      setNewPassword('');
      if (needsConfirmation) {
        setNotice(`Check ${email.trim()} for a confirmation link, then sign out and sign in with that email.`);
      } else {
        CloudSync.reset();
        await CloudSync.sync();
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setPending(false);
    }
  };

  const status =
    isOffline
      ? { icon: 'cloud_off', tone: 'text-on-surface-variant', text: "Offline. Changes sync when you're back online." }
      : cloud.status === 'syncing'
      ? { icon: 'sync', tone: 'text-primary', text: 'Syncing…' }
      : cloud.status === 'error'
      ? { icon: 'sync_problem', tone: 'text-error', text: `Sync failed: ${cloud.error}` }
      : cloud.status === 'off'
      ? { icon: 'cloud_off', tone: 'text-confidence-amber', text: 'Not connected. Sign out and sign in with your email to resume syncing.' }
      : { icon: 'cloud_done', tone: 'text-mastery-emerald', text: `Synced ${formatWhen(cloud.lastSyncedAt)}` };

  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-md flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[22px] text-primary mt-0.5" aria-hidden="true">
          {linked ? 'cloud_sync' : 'cloud_upload'}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${uid}-title`} className="font-title-sm text-base font-bold text-on-surface">
            Online backup
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {linked
              ? 'Your progress is saved on this device and backed up to your account. Sign in with your email on any device to continue.'
              : 'This profile only exists on this device. Link an email to back up your progress and use it on other devices.'}
          </p>
        </div>
      </div>

      {linked ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl bg-surface-container px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono-code text-xs text-on-surface truncate">{account.email}</p>
            <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${status.tone}`} role="status">
              <span
                className={`material-symbols-outlined text-[16px] ${cloud.status === 'syncing' && !isOffline ? 'animate-spin' : ''}`}
                aria-hidden="true"
              >
                {status.icon}
              </span>
              <span className="min-w-0">{status.text}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void CloudSync.sync()}
            disabled={isOffline || cloud.status === 'syncing'}
            className="press-scale self-start sm:self-auto min-h-[44px] flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 text-xs font-semibold text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">sync</span>
            Sync now
          </button>
        </div>
      ) : isOffline ? (
        <p className="rounded-xl bg-surface-container px-4 py-3 text-xs text-on-surface-variant">
          You're offline. Connect to link an online account.
        </p>
      ) : notice ? (
        <p role="status" className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-xs text-on-surface">
          {notice}
        </p>
      ) : (
        <form onSubmit={handleLink} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-start">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-email`} className="font-mono-code text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Email
            </label>
            <input
              id={`${uid}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              className="min-h-[44px] rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3.5 text-base sm:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-password`} className="font-mono-code text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Current password
            </label>
            <input
              id={`${uid}-password`}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="min-h-[44px] rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3.5 text-base sm:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${uid}-new-password`} className="font-mono-code text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Account password
            </label>
            <input
              id={`${uid}-new-password`}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              aria-describedby={`${uid}-pw-rules ${uid}-pw-hint`}
              className="min-h-[44px] rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3.5 text-base sm:text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
            <PasswordChecklist id={`${uid}-pw-rules`} password={newPassword} username={account.username} />
          </div>
          <button
            type="submit"
            disabled={pending || !email.trim() || !password || !!passwordProblem(newPassword, account.username)}
            className="press-scale sm:col-span-2 sm:justify-self-start min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[16px] ${pending ? 'animate-spin' : ''}`} aria-hidden="true">
              {pending ? 'progress_activity' : 'link'}
            </span>
            {pending ? 'Linking…' : 'Link account'}
          </button>
          <p id={`${uid}-pw-hint`} className="sm:col-span-2 text-[11px] text-on-surface-variant">
            The online account uses this profile's username ({account.username}). The account password replaces the
            current one on this device too.
          </p>
          {error && (
            <p role="alert" className="sm:col-span-2 rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-xs text-on-error-container">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
};

import React from 'react';
import { useStore } from '../store/useStore';
import { OfflineService } from '../services/offlineService';

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);

/**
 * One navbar control for "make SLACKR work offline":
 * - When the browser offers installation, it installs the app AND starts the full offline download.
 * - Otherwise (already installed, iOS Safari, Firefox) it runs/refreshes the offline download.
 * The button keeps the same footprint in every state so the navbar never shifts when the
 * browser's install prompt becomes available a moment after load.
 */
export const InstallOfflineButton: React.FC = () => {
  const { offlineDownload, isOffline, installPrompt, setInstallPrompt } = useStore();
  const { status, done, total, message, completedAt } = offlineDownload;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const downloading = status === 'downloading';
  const ready = status === 'ready';
  const canInstall = !!installPrompt && !isStandalone();

  const handleClick = async () => {
    if (!isOffline && !downloading) void OfflineService.downloadEverything();
    if (!canInstall) return;
    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice?.outcome === 'accepted') setInstallPrompt(null);
  };

  const title = downloading
    ? `${message || 'Downloading for offline use'} · ${pct}%`
    : canInstall
    ? 'Install SLACKR on this device and save everything for offline use'
    : ready
    ? `Available offline${completedAt ? ` · saved ${new Date(completedAt).toLocaleDateString()}` : ''}. Tap to check for updates.`
    : status === 'error'
    ? `${message || 'Download failed'} Tap to retry.`
    : 'Save the app, question bank and all diagrams for offline use';

  const label = downloading ? `${pct}%` : canInstall ? 'Install offline' : ready ? 'Offline ready' : 'Install offline';

  const tone = canInstall
    ? 'bg-primary text-on-primary border-primary hover:bg-primary-container'
    : ready
    ? 'text-mastery-emerald border-mastery-emerald/30 bg-mastery-emerald/10 hover:bg-mastery-emerald/15'
    : status === 'error'
    ? 'text-error border-error/30 bg-error/10 hover:bg-error/15'
    : 'text-on-surface-variant hover:text-on-surface border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canInstall && (downloading || (isOffline && !ready))}
      aria-label={title}
      title={title}
      className={`press-scale h-10 w-10 2xl:w-auto 2xl:min-w-[8.5rem] 2xl:px-3 shrink-0 rounded-lg border flex items-center justify-center gap-1.5 font-mono-code text-xs font-semibold cursor-pointer disabled:cursor-default ${tone}`}
      style={{ transition: 'background-color 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out, transform 120ms var(--ease-out)' }}
    >
      {downloading ? (
        <span className="relative w-5 h-5 shrink-0" aria-hidden>
          <svg viewBox="0 0 24 24" className="w-5 h-5 -rotate-90">
            <circle cx="12" cy="12" r={RING_R} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
            <circle
              cx="12" cy="12" r={RING_R} fill="none" stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - pct / 100)}
              style={{ transition: 'stroke-dashoffset 200ms ease-out' }}
            />
          </svg>
        </span>
      ) : (
        <span
          className="material-symbols-outlined text-[18px]"
          style={ready && !canInstall ? { fontVariationSettings: "'FILL' 1" } : undefined}
          aria-hidden
        >
          {canInstall ? 'install_mobile' : ready ? 'offline_pin' : status === 'error' ? 'sync_problem' : 'download_for_offline'}
        </span>
      )}
      <span className="hidden 2xl:inline tabular-nums whitespace-nowrap">{label}</span>
    </button>
  );
};

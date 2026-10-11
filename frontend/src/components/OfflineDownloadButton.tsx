import React from 'react';
import { useStore } from '../store/useStore';
import { OfflineService } from '../services/offlineService';

const RING_R = 9;
const RING_C = 2 * Math.PI * RING_R;

export const OfflineDownloadButton: React.FC = () => {
  const { offlineDownload, isOffline } = useStore();
  const { status, done, total, message, completedAt } = offlineDownload;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const downloading = status === 'downloading';
  const ready = status === 'ready';

  const title = downloading
    ? `${message || 'Downloading'} · ${pct}%`
    : ready
    ? `Available offline${completedAt ? ` · saved ${new Date(completedAt).toLocaleDateString()}` : ''}. Click to check for updates.`
    : status === 'error'
    ? `${message || 'Download failed'} Click to retry.`
    : 'Download the full app, question bank and all diagrams for offline use';

  const tone = ready
    ? 'text-mastery-emerald border-mastery-emerald/30 bg-mastery-emerald/10 hover:bg-mastery-emerald/15'
    : status === 'error'
    ? 'text-error border-error/30 bg-error/10 hover:bg-error/15'
    : 'text-on-surface-variant hover:text-on-surface border-outline-variant/30 bg-surface-container-low hover:bg-surface-container-high';

  return (
    <button
      type="button"
      onClick={() => void OfflineService.downloadEverything()}
      disabled={downloading || (isOffline && !ready)}
      aria-label={title}
      title={title}
      className={`h-8 min-w-8 px-2 rounded-lg border flex items-center justify-center gap-1.5 font-mono-code text-xs cursor-pointer disabled:cursor-default active:scale-95 ${tone}`}
      style={{ transition: 'background-color 150ms ease-out, color 150ms ease-out, border-color 150ms ease-out, transform 100ms ease-out' }}
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
          style={ready ? { fontVariationSettings: "'FILL' 1" } : undefined}
          aria-hidden
        >
          {ready ? 'offline_pin' : status === 'error' ? 'sync_problem' : 'download_for_offline'}
        </span>
      )}
      <span className="hidden lg:inline tabular-nums">
        {downloading ? `${pct}%` : ready ? 'Offline ready' : 'Download offline'}
      </span>
    </button>
  );
};

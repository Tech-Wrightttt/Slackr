import React, { useState, useEffect } from 'react';
import { useStore, type ThemeMode } from '../store/useStore';
import { SyncService } from '../services/syncService';
import { StatsDbService } from '../services/statsDb';
import { OfflineService } from '../services/offlineService';
import type { SRAlgorithm } from '../services/srsEngine';
import { db } from '../db';

export const Settings: React.FC = () => {
  const {
    theme,
    setTheme,
    currentAlgo,
    setCurrentAlgo,
    confidenceTracking,
    setConfidenceTracking,
    showTimer,
    setShowTimer,
    autoAdvance,
    setAutoAdvance,
    sessionLength,
    setSessionLength,
    installPrompt,
    setInstallPrompt,
    offlineDownload,
    isOffline,
  } = useStore();

  const [storageUsage, setStorageUsage] = useState<{ usageMb: number; quotaMb: number }>({
    usageMb: 0,
    quotaMb: 0,
  });
  const [cachedDiagrams, setCachedDiagrams] = useState<number>(0);

  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);

  const isDownloading = offlineDownload.status === 'downloading';
  const downloadPct = offlineDownload.total > 0 ? Math.round((offlineDownload.done / offlineDownload.total) * 100) : 0;

  const loadStorageEstimate = async () => {
    setStorageUsage(await SyncService.getStorageEstimate());
    setCachedDiagrams(await OfflineService.countCachedDiagrams());
  };

  useEffect(() => {
    loadStorageEstimate();
  }, []);

  // Refresh storage numbers when a download (started here or from the navbar) finishes
  useEffect(() => {
    if (!isDownloading) loadStorageEstimate();
  }, [isDownloading]);

  const handleDownloadOffline = () => void OfflineService.downloadEverything();

  const handleClearDiagramCache = async () => {
    if (confirm('Clear all cached exam diagrams? You will need internet to view them until downloaded again.')) {
      await OfflineService.clearDiagrams();
      await loadStorageEstimate();
    }
  };

  const handleAlgorithmChange = async (newAlgo: SRAlgorithm) => {
    if (newAlgo === currentAlgo) return;

    if (
      confirm(
        `Switch Spaced Repetition scheduler to ${newAlgo}? This will replay your entire attempt history through the ${newAlgo} algorithm to recompute schedules.`
      )
    ) {
      const count = await StatsDbService.switchAlgorithmAndReplay(newAlgo);
      setCurrentAlgo(newAlgo);
      setStatusNotification(`Switched to ${newAlgo}. Successfully recomputed ${count} cards.`);
      setTimeout(() => setStatusNotification(null), 5000);
    }
  };

  const handleExportData = async () => {
    await SyncService.exportLocalData();
    setStatusNotification('Exported backup JSON file successfully.');
    setTimeout(() => setStatusNotification(null), 4000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      importStrategy === 'replace' &&
      !confirm('Overwrite mode replaces all progress on this device with the contents of this file. Continue?')
    ) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await SyncService.importLocalData(parsed, importStrategy);
      if (res.algorithm) setCurrentAlgo(res.algorithm);
      setStatusNotification(res.message);
      await loadStorageEstimate();
    } catch (err: any) {
      alert(`Import error: ${err?.message || 'Invalid JSON file'}`);
    } finally {
      e.target.value = '';
      setTimeout(() => setStatusNotification(null), 5000);
    }
  };

  const handleResetAllData = async () => {
    await Promise.all([
      db.attempts.clear(),
      db.srSchedules.clear(),
      db.topicStats.clear(),
      db.deferred.clear(),
      db.sessions.clear(),
    ]);
    setShowResetModal(false);
    setStatusNotification('All user attempts and review schedules have been reset.');
    await loadStorageEstimate();
    setTimeout(() => setStatusNotification(null), 4000);
  };

  return (
    // Rendered inside the Profile page, which owns page width, padding and entrance motion
    <div className="relative w-full flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1 pb-2 border-b border-outline-variant/20">
        <div className="flex items-center gap-2 font-mono-timer text-xs text-primary">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
          <span>GLOBAL CONFIGURATION &amp; PREFERENCES</span>
        </div>
        <h2 className="font-display-lg text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
          System Settings
        </h2>
        <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
          Manage visual theme, offline diagram caching, Spaced Repetition parameters, and JSON state persistence.
        </p>
      </div>

      {statusNotification && (
        <div className="flex items-center gap-2 rounded-xl border border-mastery-emerald/30 bg-mastery-emerald/10 p-4 text-xs font-mono-code font-semibold text-mastery-emerald animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{statusNotification}</span>
        </div>
      )}

      {/* 1. Theme Configuration Mode */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">palette</span>
          </div>
          <div>
            <h2 className="font-title-sm text-base font-bold text-on-surface">Visual Workspace Appearance</h2>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Select between Obsidian Dark Mode or Minimalist Warm Paper theme.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Dark Option */}
          <div
            onClick={() => setTheme('dark')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
              theme === 'dark'
                ? 'bg-surface-container-high border-primary ring-1 ring-primary/40 shadow-sm'
                : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-on-surface">dark_mode</span>
              <div>
                <h4 className="font-body-bold text-sm text-on-surface">Obsidian Minimalist (Black)</h4>
                <p className="font-mono-code text-xs text-on-surface-variant">
                  Low-light high-contrast dark palette
                </p>
              </div>
            </div>
            {theme === 'dark' && (
              <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
            )}
          </div>

          {/* Light Option */}
          <div
            onClick={() => setTheme('light')}
            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
              theme === 'light'
                ? 'bg-surface-container-high border-primary ring-1 ring-primary/40 shadow-sm'
                : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-2xl text-on-surface">light_mode</span>
              <div>
                <h4 className="font-body-bold text-sm text-on-surface">Warm Minimalist (Paper White)</h4>
                <p className="font-mono-code text-xs text-on-surface-variant">
                  Academic editorial paper aesthetic
                </p>
              </div>
            </div>
            {theme === 'light' && (
              <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Progressive Web App (PWA) & Offline Shell Manager */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[20px]">install_mobile</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-title-sm text-base font-bold text-on-surface">
                  Progressive Web App (PWA)
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mastery-emerald/15 text-mastery-emerald font-mono-code text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-mastery-emerald animate-pulse" />
                  ServiceWorker Active
                </span>
              </div>
              <p className="font-mono-code text-xs text-on-surface-variant mt-0.5">
                Install SLACKR as a standalone native-like application on Windows, Mac, iOS, or Android with 100% offline capability.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto font-mono-code text-xs">
            {typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) ? (
              <span className="px-3 py-1 rounded-lg bg-surface-container-high text-primary border border-outline-variant/30 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                <span>Standalone App Mode</span>
              </span>
            ) : installPrompt ? (
              <button
                type="button"
                onClick={async () => {
                  if (installPrompt) {
                    installPrompt.prompt();
                    const choice = await installPrompt.userChoice;
                    if (choice.outcome === 'accepted') {
                      setInstallPrompt(null);
                      setStatusNotification('SLACKR installed successfully!');
                    }
                  }
                }}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-body-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>Install SLACKR to Device</span>
              </button>
            ) : (
              <span className="px-3 py-1 rounded-lg bg-surface-container text-on-surface-variant border border-outline-variant/20 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">devices</span>
                <span>PWA Ready</span>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 font-mono-code text-xs">
          <div className="p-3 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
            <span className="text-on-surface-variant/70 uppercase text-[10px]">Pre-cached App Shell</span>
            <span className="font-bold text-on-surface">3,609 Items &amp; Syllabus</span>
            <span className="text-mastery-emerald text-[11px]">✓ Instant Launch</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
            <span className="text-on-surface-variant/70 uppercase text-[10px]">Client Database</span>
            <span className="font-bold text-on-surface">Dexie.js / IndexedDB</span>
            <span className="text-mastery-emerald text-[11px]">✓ Local Persistence</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-container border border-outline-variant/20 flex flex-col gap-1">
            <span className="text-on-surface-variant/70 uppercase text-[10px]">Service Worker Cache</span>
            <span className="font-bold text-on-surface">Stale-While-Revalidate</span>
            <span className="text-mastery-emerald text-[11px]">✓ Background Sync</span>
          </div>
        </div>
      </div>

      {/* 3. Offline Download Manager */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-4 sm:p-6 shadow-md flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-interactive-sky shrink-0">
              <span className="material-symbols-outlined text-[20px]">download_for_offline</span>
            </div>
            <div>
              <h2 className="font-title-sm text-base font-bold text-on-surface">Offline Download</h2>
              <p className="font-mono-code text-xs text-on-surface-variant">
                Saves the whole app, fonts, the 3,609-question bank and all 2,400+ diagrams to this device.
              </p>
            </div>
          </div>

          <div className="font-mono-code text-xs text-on-surface-variant sm:text-right shrink-0">
            <div>Storage used: <strong className="text-on-surface">{storageUsage.usageMb} MB</strong></div>
            <div>Diagrams saved: <strong className="text-on-surface tabular-nums">{cachedDiagrams.toLocaleString()}</strong></div>
          </div>
        </div>

        {(isDownloading || offlineDownload.message) && (
          <div className="space-y-1.5 font-mono-code text-xs">
            <div className="flex justify-between gap-3 text-on-surface-variant">
              <span
                className={
                  offlineDownload.status === 'error'
                    ? 'text-error'
                    : offlineDownload.status === 'ready'
                    ? 'text-mastery-emerald'
                    : ''
                }
              >
                {offlineDownload.message}
              </span>
              {isDownloading && (
                <span className="tabular-nums shrink-0">
                  {offlineDownload.done.toLocaleString()} / {offlineDownload.total.toLocaleString()} · {downloadPct}%
                </span>
              )}
            </div>
            {isDownloading && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${downloadPct}%`, transition: 'width 200ms ease-out' }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleDownloadOffline}
            disabled={isDownloading || isOffline}
            className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-fixed-dim px-4 py-2.5 min-h-[44px] text-xs font-body-bold text-on-primary shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
            style={{ transition: 'background-color 150ms ease-out, transform 100ms ease-out' }}
          >
            <span className="material-symbols-outlined text-[16px]">
              {offlineDownload.status === 'ready' ? 'sync' : 'download'}
            </span>
            <span>
              {isDownloading
                ? `Downloading… ${downloadPct}%`
                : offlineDownload.status === 'ready'
                ? 'Check for updates'
                : 'Download for offline use'}
            </span>
          </button>

          <button
            onClick={handleClearDiagramCache}
            disabled={isDownloading}
            className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-2.5 min-h-[44px] text-xs font-mono-code text-on-surface-variant hover:text-error disabled:opacity-50 cursor-pointer"
            style={{ transition: 'color 150ms ease-out' }}
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            <span>Clear Diagram Cache</span>
          </button>
        </div>
      </div>

      {/* 3. Spaced Repetition Scheduling Protocol */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-confidence-amber">
            <span className="material-symbols-outlined text-[20px]">repeat</span>
          </div>
          <div>
            <h2 className="font-title-sm text-base font-bold text-on-surface">
              Spaced Repetition Algorithm Protocol
            </h2>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Select your memory decay model. Switching models automatically replays historical attempts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {(['SM-2', 'FSRS', 'Custom'] as SRAlgorithm[]).map((algo) => {
            const isSelected = currentAlgo === algo;
            return (
              <div
                key={algo}
                onClick={() => handleAlgorithmChange(algo)}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                  isSelected
                    ? 'bg-surface-container-high border-primary ring-1 ring-primary/40 shadow-sm'
                    : 'bg-surface-container border-outline-variant/20 hover:bg-surface-container-high'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono-code text-xs font-bold text-on-surface">{algo}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-primary text-[18px]">check_circle</span>
                    )}
                  </div>
                  <p className="font-body-base text-xs text-on-surface-variant leading-relaxed">
                    {algo === 'SM-2'
                      ? 'SuperMemo-2: Classic spacing interval based on easiness factor.'
                      : algo === 'FSRS'
                      ? 'Free Spaced Repetition Scheduler: Stability and difficulty model.'
                      : 'Leitner 3-Box: Rapid tiering with strict immediate demotion on error.'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Session Preferences */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-tertiary">
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </div>
          <div>
            <h2 className="font-title-sm text-base font-bold text-on-surface">Session Preferences</h2>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Configure telemetry tracking during question evaluation.
            </p>
          </div>
        </div>

        <div className="space-y-3 divide-y divide-outline-variant/10 text-xs font-mono-code text-on-surface">
          <div className="flex items-center justify-between pt-2">
            <div>
              <div className="font-bold">Confidence Calibration (1-5 Rating)</div>
              <div className="text-on-surface-variant text-[11px]">
                Enables metacognitive certainty rating prior to answer submission
              </div>
            </div>
            <input
              type="checkbox"
              checked={confidenceTracking}
              onChange={(e) => setConfidenceTracking(e.target.checked)}
              className="h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <div className="font-bold">Elapsed Stopwatch Timer</div>
              <div className="text-on-surface-variant text-[11px]">
                Displays per-question stopwatch pacing in top rail
              </div>
            </div>
            <input
              type="checkbox"
              checked={showTimer}
              onChange={(e) => setShowTimer(e.target.checked)}
              className="h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <div className="font-bold">Auto-Advance on Correct Answer</div>
              <div className="text-on-surface-variant text-[11px]">
                Immediately triggers next question without waiting for Enter
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              className="h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <div className="font-bold">Default Rapid Quiz Length</div>
              <div className="text-on-surface-variant text-[11px]">
                Number of questions staged for rapid custom sprint sets
              </div>
            </div>
            <select
              value={sessionLength}
              onChange={(e) => setSessionLength(Number(e.target.value))}
              className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1.5 text-xs font-mono-code text-on-surface focus:outline-none"
            >
              <option value={10}>10 Questions</option>
              <option value={20}>20 Questions</option>
              <option value={40}>40 Questions</option>
              <option value={80}>80 Questions (Full Paper)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 5. Backup & Restore Data */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">database</span>
          </div>
          <div>
            <h2 className="font-title-sm text-base font-bold text-on-surface">Data Backup &amp; Portability</h2>
            <p className="font-mono-code text-xs text-on-surface-variant">
              Export or import progress, schedules, bookmarks, deferred items, learning resources and breakdowns.
              Works online and offline. Import also accepts learning_resources.json, analytical_breakdowns.json and
              backend exports.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleExportData}
            className="flex items-center gap-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 px-4 py-2.5 text-xs font-mono-code text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">download</span>
            <span>Export JSON Archive</span>
          </button>

          <label className="flex items-center gap-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 px-4 py-2.5 text-xs font-mono-code text-on-surface transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-[16px] text-interactive-sky">upload</span>
            <span>Import JSON Archive</span>
            <input type="file" accept=".json,application/json" onChange={handleImportFile} className="hidden" />
          </label>

          <div className="flex items-center gap-2 font-mono-code text-xs text-on-surface-variant">
            <span>Strategy:</span>
            <select
              value={importStrategy}
              onChange={(e: any) => setImportStrategy(e.target.value)}
              className="rounded bg-surface-container px-2 py-1 border border-outline-variant/30 text-on-surface text-xs"
            >
              <option value="merge">Merge with existing</option>
              <option value="replace">Overwrite database</option>
            </select>
          </div>
        </div>
      </div>

      {/* 6. Danger Zone */}
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-title-sm text-sm font-bold text-error">Danger Zone // Reset Local Records</h3>
          <p className="font-mono-code text-xs text-on-surface-variant mt-0.5">
            Wipes all attempt history, consistency ratings, and SRS schedule queues from this browser.
          </p>
        </div>

        <button
          onClick={() => setShowResetModal(true)}
          className="px-4 py-2 rounded-xl bg-error/15 hover:bg-error/25 border border-error/30 text-error font-mono-code text-xs font-bold transition-all cursor-pointer self-start sm:self-auto"
        >
          Reset Telemetry Database
        </button>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="max-w-md w-full rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-2 text-error">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="font-title-sm text-lg font-bold">Confirm Database Reset</h3>
            </div>
            <p className="font-mono-code text-xs text-on-surface-variant leading-relaxed">
              This action will permanently delete all stored question attempts, topic mastery stats, and SRS card
              decay intervals. This cannot be undone unless you have a JSON backup.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-lg bg-surface-container font-mono-code text-xs text-on-surface cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAllData}
                className="px-4 py-2 rounded-lg bg-error hover:bg-error/90 text-white font-mono-code text-xs font-bold cursor-pointer"
              >
                Confirm &amp; Reset All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

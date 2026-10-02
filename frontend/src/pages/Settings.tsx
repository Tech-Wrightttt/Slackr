import React, { useState, useEffect } from 'react';
import { useStore, type ThemeMode } from '../store/useStore';
import { SyncService } from '../services/syncService';
import { StatsDbService } from '../services/statsDb';
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
  } = useStore();

  const [storageUsage, setStorageUsage] = useState<{ usageMb: number; quotaMb: number }>({
    usageMb: 0,
    quotaMb: 0,
  });

  const [isDownloadingDiagrams, setIsDownloadingDiagrams] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; pct: number }>({
    current: 0,
    total: 0,
    pct: 0,
  });
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const [importStrategy, setImportStrategy] = useState<'merge' | 'replace'>('merge');
  const [statusNotification, setStatusNotification] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState<boolean>(false);

  useEffect(() => {
    loadStorageEstimate();
  }, []);

  const loadStorageEstimate = async () => {
    const est = await SyncService.getStorageEstimate();
    setStorageUsage(est);
  };

  const handleDownloadAllDiagrams = async () => {
    setIsDownloadingDiagrams(true);
    setSyncStatusMsg('Starting diagram download...');

    try {
      const res = await SyncService.downloadAllDiagrams((current, total, pct) => {
        setDownloadProgress({ current, total, pct });
        setSyncStatusMsg(`Downloaded ${current} of ${total} diagrams (${pct}%)...`);
      });

      setSyncStatusMsg(`Sync complete! ${res.downloaded} diagrams saved for 100% offline use.`);
      await loadStorageEstimate();
    } catch (err: any) {
      setSyncStatusMsg(`Download failed: ${err?.message || 'Network error'}`);
    } finally {
      setIsDownloadingDiagrams(false);
    }
  };

  const handleClearDiagramCache = async () => {
    if (confirm('Clear all cached exam diagrams? You will need internet to view them until re-synced.')) {
      await SyncService.clearDiagramCache();
      setSyncStatusMsg('Diagram cache cleared.');
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

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await SyncService.importLocalData(parsed, importStrategy);
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
    await db.attempts.clear();
    await db.srSchedules.clear();
    await db.topicStats.clear();
    setShowResetModal(false);
    setStatusNotification('All user attempts and review schedules have been reset.');
    await loadStorageEstimate();
    setTimeout(() => setStatusNotification(null), 4000);
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col gap-1 pb-2 border-b border-outline-variant/20">
        <div className="flex items-center gap-2 font-mono-timer text-xs text-primary">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
          <span>GLOBAL CONFIGURATION &amp; PREFERENCES</span>
        </div>
        <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
          System Settings
        </h1>
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

      {/* 2. Offline Diagram Cache Manager */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-6 shadow-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-interactive-sky">
              <span className="material-symbols-outlined text-[20px]">hard_drive</span>
            </div>
            <div>
              <h2 className="font-title-sm text-base font-bold text-on-surface">
                Offline Diagram Cache Manager
              </h2>
              <p className="font-mono-code text-xs text-on-surface-variant">
                Pre-cache all 2,400+ exam schematics into IndexedDB for 100% offline study.
              </p>
            </div>
          </div>

          <div className="text-right font-mono-code text-xs text-on-surface-variant">
            IndexedDB: <strong className="text-on-surface">{storageUsage.usageMb} MB</strong>
          </div>
        </div>

        {isDownloadingDiagrams && (
          <div className="space-y-1.5 font-mono-code text-xs">
            <div className="flex justify-between text-on-surface-variant">
              <span>{syncStatusMsg}</span>
              <span>{downloadProgress.pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div className="h-full bg-primary transition-all duration-200" style={{ width: `${downloadProgress.pct}%` }} />
            </div>
          </div>
        )}

        {syncStatusMsg && !isDownloadingDiagrams && (
          <div className="text-xs font-mono-code text-primary">{syncStatusMsg}</div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleDownloadAllDiagrams}
            disabled={isDownloadingDiagrams}
            className="flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary-fixed-dim px-4 py-2.5 text-xs font-body-bold text-on-primary shadow-sm active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Download All Diagrams (Offline Cache)</span>
          </button>

          <button
            onClick={handleClearDiagramCache}
            className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-2.5 text-xs font-mono-code text-on-surface-variant hover:text-error transition-all cursor-pointer"
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
              Export all local IndexedDB attempt records and review schedules as JSON.
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
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
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

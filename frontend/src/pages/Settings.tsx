import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Download,
  Trash2,
  HardDrive,
  Repeat,
  Sliders,
  Database,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Star,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { SyncService } from '../services/syncService';
import { StatsDbService } from '../services/statsDb';
import type { SRAlgorithm } from '../services/srsEngine';
import { db } from '../db';

export const Settings: React.FC = () => {
  const {
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

  // Storage estimation
  const [storageUsage, setStorageUsage] = useState<{ usageMb: number; quotaMb: number }>({
    usageMb: 0,
    quotaMb: 0,
  });

  // Diagram sync state
  const [isDownloadingDiagrams, setIsDownloadingDiagrams] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; pct: number }>({
    current: 0,
    total: 0,
    pct: 0,
  });
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  // Import/Export state
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
      setStatusNotification(
        `Switched to ${newAlgo}. Successfully recomputed ${count} cards.`
      );
      setTimeout(() => setStatusNotification(null), 5000);
    }
  };

  const handleExportData = async () => {
    await SyncService.exportLocalData();
    setStatusNotification('Exported backup file successfully.');
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

  const handleCompanionSync = async () => {
    setSyncStatusMsg('Syncing with local companion server (port 8000)...');
    const ok = await SyncService.syncWithCompanionBackend();
    if (ok) {
      setSyncStatusMsg('Successfully synchronized attempts with companion backend.');
    } else {
      setSyncStatusMsg('Companion server not reached. Operating in pure offline sandbox.');
    }
    setTimeout(() => setSyncStatusMsg(null), 5000);
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
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-10 animate-in fade-in duration-300">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-400 border border-sky-500/20">
            Preferences & Storage
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-4xl">Application Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage offline image caching, Spaced Repetition algorithms, and backup data.
        </p>
      </div>

      {statusNotification && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-300 animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{statusNotification}</span>
        </div>
      )}

      {/* 1. Offline Image Sync Manager (PelNETS Model) */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-400 border border-sky-500/20">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Offline Diagram Cache Manager</h2>
              <p className="text-xs text-slate-400">
                Pre-cache all 2,400+ exam diagrams and screenshots into browser storage for complete offline review.
              </p>
            </div>
          </div>

          <div className="text-right text-xs text-slate-400">
            Storage: <strong className="text-white font-mono">{storageUsage.usageMb} MB</strong> used
          </div>
        </div>

        {/* Progress Bar if downloading */}
        {isDownloadingDiagrams && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>{syncStatusMsg}</span>
              <span className="font-mono">{downloadProgress.pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-sky-500 transition-all duration-200"
                style={{ width: `${downloadProgress.pct}%` }}
              />
            </div>
          </div>
        )}

        {syncStatusMsg && !isDownloadingDiagrams && (
          <div className="text-xs font-medium text-sky-400">{syncStatusMsg}</div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleDownloadAllDiagrams}
            disabled={isDownloadingDiagrams}
            className="flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/20 hover:bg-sky-400 active:scale-95 disabled:opacity-50 transition-all"
          >
            <Download className="h-4 w-4" />
            <span>Download All Diagrams for Offline Use</span>
          </button>

          <button
            onClick={handleClearDiagramCache}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 active:scale-95 transition-all"
          >
            <Trash2 className="h-4 w-4" />
            <span>Clear Diagram Cache</span>
          </button>
        </div>
      </div>

      {/* 2. Spaced Repetition Algorithm Settings */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-purple-500/10 p-2.5 text-purple-400 border border-purple-500/20">
            <Repeat className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Spaced Repetition Algorithm</h2>
            <p className="text-xs text-slate-400">
              Choose your review scheduling model. Switching algorithms automatically replays historical attempts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              id: 'SM-2' as SRAlgorithm,
              title: 'SuperMemo SM-2',
              desc: 'Standard, battle-tested classical SRS. Calculates interval based on Easiness Factor and repetition count.',
            },
            {
              id: 'FSRS' as SRAlgorithm,
              title: 'FSRS (Free SRS)',
              desc: 'Modern machine learning retention model tracking card Stability, Difficulty, and Retrievability curves.',
            },
            {
              id: 'Custom' as SRAlgorithm,
              title: 'SLACKR Custom',
              desc: 'Adaptive algorithm incorporating topic error rate, confidence calibration, and response time factors.',
            },
          ].map((algo) => {
            const isSelected = currentAlgo === algo.id;
            return (
              <div
                key={algo.id}
                onClick={() => handleAlgorithmChange(algo.id)}
                className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                  isSelected
                    ? 'border-purple-500/80 bg-purple-500/10 ring-2 ring-purple-500/20'
                    : 'border-slate-800 bg-slate-950/60 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-white">{algo.title}</h3>
                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? 'border-purple-400 bg-purple-500'
                        : 'border-slate-600 bg-slate-800'
                    }`}
                  >
                    {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-slate-400">{algo.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Quiz Experience Preferences */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-400 border border-indigo-500/20">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Quiz Experience Preferences</h2>
            <p className="text-xs text-slate-400">Configure timer display and pre-reveal confidence calibration.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Confidence calibration toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div>
              <h4 className="text-sm font-semibold text-white">Pre-Reveal Confidence Tracking</h4>
              <p className="text-xs text-slate-400">
                Rate your certainty (1-5) before submitting each answer to measure overconfidence/underconfidence.
              </p>
            </div>
            <input
              type="checkbox"
              checked={confidenceTracking}
              onChange={(e) => setConfidenceTracking(e.target.checked)}
              className="h-5 w-5 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
            />
          </div>

          {/* Show timer toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div>
              <h4 className="text-sm font-semibold text-white">Live Question Response Timer</h4>
              <p className="text-xs text-slate-400">Display elapsed seconds while a question is active.</p>
            </div>
            <input
              type="checkbox"
              checked={showTimer}
              onChange={(e) => setShowTimer(e.target.checked)}
              className="h-5 w-5 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      {/* 4. Data Backup, Export & Reset (Task 23) */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 backdrop-blur-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400 border border-emerald-500/20">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Data Management & Portability</h2>
            <p className="text-xs text-slate-400">
              Export and import your study logs to portable JSON backups.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Export */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 space-y-3">
            <h4 className="text-sm font-bold text-white">Export Local Statistics</h4>
            <p className="text-xs text-slate-400">
              Download your complete attempt logs, confidence ratings, and SRS schedules as a JSON file.
            </p>
            <button
              onClick={handleExportData}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
            >
              <Download className="h-4 w-4" />
              <span>Export JSON Backup</span>
            </button>
          </div>

          {/* Import */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 space-y-3">
            <h4 className="text-sm font-bold text-white">Import Statistics Backup</h4>
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="importStrategy"
                  checked={importStrategy === 'merge'}
                  onChange={() => setImportStrategy('merge')}
                  className="text-sky-500"
                />
                <span>Merge with existing</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="importStrategy"
                  checked={importStrategy === 'replace'}
                  onChange={() => setImportStrategy('replace')}
                  className="text-sky-500"
                />
                <span>Replace all</span>
              </label>
            </div>
            <label className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer">
              <Upload className="h-4 w-4" />
              <span>Select File to Import</span>
              <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
            </label>
          </div>
        </div>

        {/* Companion Server Sync */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <div>
            <h4 className="text-sm font-bold text-white">Local Companion Server Sync</h4>
            <p className="text-xs text-slate-400">
              Sync attempts directly to <code>backend/data/user_stats.json</code> when the FastAPI service is running.
            </p>
          </div>
          <button
            onClick={handleCompanionSync}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 active:scale-95 transition-all"
          >
            <RefreshCw className="h-4 w-4 text-sky-400" />
            <span>Sync with Local Companion</span>
          </button>
        </div>

        {/* Danger Zone: Reset */}
        <div className="border-t border-slate-800/80 pt-4 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-rose-400">Danger Zone</h4>
            <p className="text-xs text-slate-500">Permanently clear all local progress and SRS reviews.</p>
          </div>
          <button
            onClick={() => setShowResetModal(true)}
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all"
          >
            Reset All Statistics
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-bold text-lg text-white">Are you absolutely sure?</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              This action cannot be undone. All attempts, SRS intervals, and topic analytics stored in your browser database will be permanently wiped.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleResetAllData}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition-colors"
              >
                Yes, Reset All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { create } from 'zustand';
import type { SRAlgorithm } from '../services/srsEngine';

export type ThemeMode = 'dark' | 'light';

export type OfflinePhase = 'app' | 'fonts' | 'data' | 'diagrams';

export interface OfflineDownloadState {
  status: 'idle' | 'downloading' | 'ready' | 'error';
  phase: OfflinePhase | null;
  done: number;
  total: number;
  failed: number;
  message: string | null;
  completedAt: string | null;
}

export interface CloudState {
  status: 'off' | 'idle' | 'syncing' | 'error';
  lastSyncedAt: string | null;
  error: string | null;
}

interface AppState {
  offlineDownload: OfflineDownloadState;
  setOfflineDownload: (patch: Partial<OfflineDownloadState>) => void;
  theme: ThemeMode;
  isOffline: boolean;
  currentAlgo: SRAlgorithm;
  confidenceTracking: boolean;
  // Block Submit until "How sure are you?" is answered (only while confidenceTracking is on)
  requireConfidence: boolean;
  showTimer: boolean;
  autoAdvance: boolean;
  sessionLength: number;
  hideAnswersInCustomQuiz: boolean;
  installPrompt: any | null;
  /** Draw mode stays on across questions until the user turns it off */
  drawMode: boolean;
  setDrawMode: (on: boolean) => void;
  /** Question currently on screen (null = no question, so the draw button hides) */
  drawKey: string | null;
  setDrawKey: (key: string | null) => void;
  // Local profile: authReady flips once the account table has been checked on boot
  authReady: boolean;
  hasAccount: boolean;
  currentUser: string | null;
  setAuth: (patch: { hasAccount?: boolean; currentUser?: string | null }) => void;
  /** Online backup of the signed-in profile (see services/cloudSync.ts) */
  cloud: CloudState;
  setCloud: (patch: Partial<CloudState>) => void;
  /** Backend reports online accounts are configured (cached for offline launches) */
  accountsEnabled: boolean;
  setAccountsEnabled: (enabled: boolean) => void;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setOffline: (offline: boolean) => void;
  setCurrentAlgo: (algo: SRAlgorithm) => void;
  setConfidenceTracking: (val: boolean) => void;
  setRequireConfidence: (val: boolean) => void;
  setShowTimer: (val: boolean) => void;
  setAutoAdvance: (val: boolean) => void;
  setSessionLength: (val: number) => void;
  setHideAnswersInCustomQuiz: (val: boolean) => void;
  setInstallPrompt: (evt: any) => void;
}

const getInitialTheme = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('slackr_theme') as ThemeMode | null;
    if (saved === 'dark' || saved === 'light') return saved;
  }
  return 'dark';
};

const applyThemeToDOM = (theme: ThemeMode) => {
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Installed PWA status bar / browser chrome tint matches the app theme
    document.querySelectorAll('meta[name="theme-color"]').forEach((meta: Element) => {
      meta.removeAttribute('media');
      meta.setAttribute('content', theme === 'dark' ? '#090D16' : '#F8FAF0');
    });
  }
};

const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

export const OFFLINE_STATE_KEY = 'slackr_offline_state';

const getInitialOfflineState = (): OfflineDownloadState => {
  const base: OfflineDownloadState = {
    status: 'idle', phase: null, done: 0, total: 0, failed: 0, message: null, completedAt: null,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(OFFLINE_STATE_KEY) || 'null');
    if (saved?.completedAt) {
      return { ...base, status: 'ready', completedAt: saved.completedAt, failed: saved.failed || 0 };
    }
  } catch (_) {}
  return base;
};

export const useStore = create<AppState>((set, get) => ({
  offlineDownload: getInitialOfflineState(),
  setOfflineDownload: (patch) => set({ offlineDownload: { ...get().offlineDownload, ...patch } }),
  theme: initialTheme,
  isOffline: !navigator.onLine,
  currentAlgo: 'SM-2',
  confidenceTracking: true,
  requireConfidence: (() => {
    try {
      return localStorage.getItem('slackr_require_confidence') !== '0';
    } catch {
      return true;
    }
  })(),
  showTimer: true,
  autoAdvance: false,
  sessionLength: 20,
  hideAnswersInCustomQuiz: false,
  installPrompt: null,
  drawMode: false,
  setDrawMode: (on) => set({ drawMode: on }),
  drawKey: null,
  setDrawKey: (key) => set(key === null ? { drawKey: null, drawMode: false } : { drawKey: key }),
  authReady: false,
  hasAccount: false,
  currentUser: null,
  setAuth: (patch) => set({ ...patch, authReady: true }),
  cloud: { status: 'off', lastSyncedAt: null, error: null },
  setCloud: (patch) => set((s) => ({ cloud: { ...s.cloud, ...patch } })),
  accountsEnabled: (() => {
    try {
      return localStorage.getItem('slackr_accounts_enabled') === '1';
    } catch {
      return false;
    }
  })(),
  setAccountsEnabled: (enabled) => set({ accountsEnabled: enabled }),

  toggleTheme: () => {
    const nextTheme = get().theme === 'dark' ? 'light' : 'dark';
    applyThemeToDOM(nextTheme);
    localStorage.setItem('slackr_theme', nextTheme);
    set({ theme: nextTheme });
  },

  setTheme: (theme) => {
    applyThemeToDOM(theme);
    localStorage.setItem('slackr_theme', theme);
    set({ theme });
  },

  setOffline: (offline) => set({ isOffline: offline }),
  setCurrentAlgo: (algo) => set({ currentAlgo: algo }),
  setConfidenceTracking: (val) => set({ confidenceTracking: val }),
  setRequireConfidence: (val) => {
    try {
      localStorage.setItem('slackr_require_confidence', val ? '1' : '0');
    } catch {}
    set({ requireConfidence: val });
  },
  setShowTimer: (val) => set({ showTimer: val }),
  setAutoAdvance: (val) => set({ autoAdvance: val }),
  setSessionLength: (val) => set({ sessionLength: val }),
  setHideAnswersInCustomQuiz: (val) => set({ hideAnswersInCustomQuiz: val }),
  setInstallPrompt: (evt) => set({ installPrompt: evt }),
}));

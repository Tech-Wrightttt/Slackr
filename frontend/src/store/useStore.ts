import { create } from 'zustand';
import type { SRAlgorithm } from '../services/srsEngine';

export type ThemeMode = 'dark' | 'light';

interface AppState {
  theme: ThemeMode;
  isOffline: boolean;
  currentAlgo: SRAlgorithm;
  confidenceTracking: boolean;
  showTimer: boolean;
  autoAdvance: boolean;
  sessionLength: number;
  installPrompt: any | null;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setOffline: (offline: boolean) => void;
  setCurrentAlgo: (algo: SRAlgorithm) => void;
  setConfidenceTracking: (val: boolean) => void;
  setShowTimer: (val: boolean) => void;
  setAutoAdvance: (val: boolean) => void;
  setSessionLength: (val: number) => void;
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
  }
};

const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

export const useStore = create<AppState>((set, get) => ({
  theme: initialTheme,
  isOffline: !navigator.onLine,
  currentAlgo: 'SM-2',
  confidenceTracking: true,
  showTimer: true,
  autoAdvance: false,
  sessionLength: 20,
  installPrompt: null,

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
  setShowTimer: (val) => set({ showTimer: val }),
  setAutoAdvance: (val) => set({ autoAdvance: val }),
  setSessionLength: (val) => set({ sessionLength: val }),
  setInstallPrompt: (evt) => set({ installPrompt: evt }),
}));

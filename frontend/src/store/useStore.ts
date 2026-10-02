import { create } from 'zustand';
import type { SRAlgorithm } from '../services/srsEngine';

interface AppState {
  isOffline: boolean;
  currentAlgo: SRAlgorithm;
  confidenceTracking: boolean;
  showTimer: boolean;
  autoAdvance: boolean;
  sessionLength: number;
  installPrompt: any | null;
  setOffline: (offline: boolean) => void;
  setCurrentAlgo: (algo: SRAlgorithm) => void;
  setConfidenceTracking: (val: boolean) => void;
  setShowTimer: (val: boolean) => void;
  setAutoAdvance: (val: boolean) => void;
  setSessionLength: (val: number) => void;
  setInstallPrompt: (evt: any) => void;
}

export const useStore = create<AppState>((set) => ({
  isOffline: !navigator.onLine,
  currentAlgo: 'SM-2',
  confidenceTracking: true,
  showTimer: true,
  autoAdvance: false,
  sessionLength: 20,
  installPrompt: null,

  setOffline: (offline) => set({ isOffline: offline }),
  setCurrentAlgo: (algo) => set({ currentAlgo: algo }),
  setConfidenceTracking: (val) => set({ confidenceTracking: val }),
  setShowTimer: (val) => set({ showTimer: val }),
  setAutoAdvance: (val) => set({ autoAdvance: val }),
  setSessionLength: (val) => set({ sessionLength: val }),
  setInstallPrompt: (evt) => set({ installPrompt: evt }),
}));

import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { useStore } from './store/useStore';
import { WifiOff, Loader2 } from 'lucide-react';

const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const QuizByYear = lazy(() => import('./pages/QuizByYear').then((m) => ({ default: m.QuizByYear })));
const QuizByTopic = lazy(() => import('./pages/QuizByTopic').then((m) => ({ default: m.QuizByTopic })));
const QuizCombined = lazy(() => import('./pages/QuizCombined').then((m) => ({ default: m.QuizCombined })));
const QuizCustom = lazy(() => import('./pages/QuizCustom').then((m) => ({ default: m.QuizCustom })));
const QuizSpacedRepetition = lazy(() =>
  import('./pages/QuizSpacedRepetition').then((m) => ({ default: m.QuizSpacedRepetition }))
);
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const QuestionHistory = lazy(() =>
  import('./pages/QuestionHistory').then((m) => ({ default: m.QuestionHistory }))
);
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));

const LoadingFallback: React.FC = () => (
  <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-4 backdrop-blur-sm">
      <Loader2 className="h-5 w-5 animate-spin text-sky-400" />
      <span className="text-sm font-medium">Loading SLACKR View...</span>
    </div>
  </div>
);

export const App: React.FC = () => {
  const { isOffline, setOffline } = useStore();

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
        {/* Offline notification banner if offline */}
        {isOffline && (
          <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-xs font-semibold text-amber-300 backdrop-blur-md">
            <WifiOff className="h-3.5 w-3.5" />
            <span>You are currently offline. All quizzes, diagrams, and attempt logs are running locally via IndexedDB.</span>
          </div>
        )}

        {/* Global Navigation Header */}
        <Navbar />

        {/* Main Routed Content with Lazy Suspense */}
        <main className="flex-1 pb-16">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/quiz/year" element={<QuizByYear />} />
              <Route path="/quiz/topic" element={<QuizByTopic />} />
              <Route path="/quiz/combined" element={<QuizCombined />} />
              <Route path="/quiz/custom" element={<QuizCustom />} />
              <Route path="/quiz/srs" element={<QuizSpacedRepetition />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/history/:id" element={<QuestionHistory />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </main>

        {/* Minimal Footer */}
        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
          <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>SLACKR • Offline-First PHILNITS Reviewer & Spaced Repetition Platform</p>
            <p className="text-[11px] text-slate-600">Built for Zero-Latency Local Execution</p>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
};

export default App;

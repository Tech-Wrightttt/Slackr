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
  <div className="flex min-h-[60vh] items-center justify-center text-on-surface-variant">
    <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low px-6 py-4 backdrop-blur-sm shadow-md">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      <span className="text-sm font-mono-code">Telemetry Synchronizing...</span>
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
      <div className="flex min-h-screen flex-col bg-surface-container-lowest font-body-base text-on-surface selection:bg-primary-container selection:text-on-primary">
        {/* Global Navigation Header */}
        <Navbar />

        {/* Offline Notification Strip */}
        {isOffline && (
          <div className="fixed top-16 left-0 right-0 z-40 flex items-center justify-center gap-2 bg-confidence-amber/15 border-b border-confidence-amber/30 px-4 py-1.5 text-xs font-mono-code font-semibold text-confidence-amber backdrop-blur-md">
            <WifiOff className="h-3.5 w-3.5" />
            <span>Telemetry Offline: Local Dexie.js cache active for all 3,609 PHILNITS items.</span>
          </div>
        )}

        {/* Main Routed Content Viewport */}
        <main className={`flex-1 w-full pt-16 min-h-[calc(100vh-70px)] bg-surface-container-lowest ${isOffline ? 'pt-24' : 'pt-16'}`}>
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

        {/* Editorial Telemetry Footer */}
        <footer className="w-full bg-obsidian-surface-dim dark:bg-obsidian-surface-dim bg-surface-container-low border-t border-outline-variant/20 py-5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono-code text-xs text-on-surface-variant/80">
            <div className="flex items-center gap-3">
              <span className="font-label-caps text-primary uppercase font-bold">SLACKR CORE</span>
              <span>PHILNITS FE / AP Academic Telemetry Engine</span>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span>IndexedDB: Active</span>
              <span>•</span>
              <span>V2.4.0 (Offline-First)</span>
              <span>•</span>
              <span>© 2025</span>
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
};

export default App;

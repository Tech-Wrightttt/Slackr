import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { DrawOverlay } from './components/DrawOverlay';
import { useStore } from './store/useStore';
import { StatsDbService } from './services/statsDb';
import { AuthService } from './services/authService';
import { ReportService } from './services/reportService';
import { CloudSync } from './services/cloudSync';
import type { SRAlgorithm } from './services/srsEngine';
import { WifiOff } from 'lucide-react';
import { Mascot } from './components/Mascot';
import { ErrorBoundary } from './components/ErrorBoundary';

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
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const News = lazy(() => import('./pages/News').then((m) => ({ default: m.News })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const SignIn = lazy(() => import('./pages/Auth').then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import('./pages/Auth').then((m) => ({ default: m.SignUp })));
const ForgotPassword = lazy(() => import('./pages/PasswordReset').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/PasswordReset').then((m) => ({ default: m.ResetPassword })));

const LoadingFallback: React.FC = () => (
  <div className="flex min-h-[60vh] items-center justify-center text-on-surface-variant">
    <div role="status" className="flex flex-col items-center gap-3">
      <Mascot pose="loading" className="h-24 w-24 motion-safe:animate-pulse" />
      <span className="text-sm font-mono-code">Telemetry Synchronizing...</span>
    </div>
  </div>
);

// App routes that open behind the launch sign-up prompt. Legal pages and unknown paths (404) skip it.
const PROMPTED_ROUTE = /^\/($|quiz\/|analytics|history\/|profile|news|settings)/;
const isKnownRoute = (path: string) => PROMPTED_ROUTE.test(path);

// Main app chrome. Accounts are optional: guests and signed-in profiles see the same app.
const AppShell: React.FC = () => {
  const { isOffline, authReady, hasAccount, currentUser } = useStore();
  const location = useLocation();

  // Wait for the local profile check so the dashboard never flashes before the auth screen
  if (!authReady) return null;
  // Each launch opens on sign-up (or sign-in when a profile exists); "Skip for now" continues as guest
  // Legal pages and the 404 page stay reachable before signing up
  if (!currentUser && isKnownRoute(location.pathname) && AuthService.shouldPromptThisLaunch()) {
    return (
      <Navigate
        to={hasAccount ? '/signin' : '/signup'}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-container-lowest font-body-base text-on-surface selection:bg-primary-container selection:text-on-primary">
      {/* Global Navigation Header */}
      <Navbar />

      {/* Scribble layer + floating draw button; only present while a question is on screen */}
      <DrawOverlay />

      {/* Offline Notification Strip */}
      {isOffline && (
        <div
          style={{ top: 'calc(4rem + env(safe-area-inset-top, 0px))' }}
          className="fixed left-0 right-0 z-40 flex items-center justify-center gap-2 bg-confidence-amber/15 border-b border-confidence-amber/30 px-4 py-1.5 text-xs font-mono-code font-semibold text-confidence-amber backdrop-blur-md">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Telemetry Offline: Local Dexie.js cache active for all 3,609 PHILNITS items.</span>
        </div>
      )}

      {/* Main Routed Content Viewport */}
      <main className={`flex-1 w-full pt-16 min-h-[calc(100vh-70px)] bg-surface-container-lowest ${isOffline ? 'pt-24' : 'pt-16'}`}>
        <Suspense fallback={<LoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Editorial Telemetry Footer */}
      <footer className="w-full bg-surface-container-low dark:bg-obsidian-surface-dim border-t border-outline-variant/20 py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-3 font-mono-code text-xs text-on-surface-variant text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <span className="font-label-caps text-primary uppercase font-bold">SLACKR CORE</span>
            <span>PHILNITS FE / AP Academic Telemetry Engine</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px]">
            <span>IndexedDB: Active</span>
            <span aria-hidden="true">•</span>
            <Link to="/news" className="hover:text-primary underline-offset-2 hover:underline">
              v{__APP_VERSION__} (Offline-First)
            </Link>
            <span aria-hidden="true">•</span>
            <Link to="/legal/terms" className="hover:text-primary underline-offset-2 hover:underline">
              Terms
            </Link>
            <Link to="/legal/privacy" className="hover:text-primary underline-offset-2 hover:underline">
              Privacy
            </Link>
            <a
              href="https://philnits.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary underline-offset-2 hover:underline"
            >
              Questions © PhilNITS
            </a>
            <span aria-hidden="true">•</span>
            <span>© 2025</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  const { setOffline, setCurrentAlgo, setAuth } = useStore();

  useEffect(() => {
    StatsDbService.getSetting<SRAlgorithm>('spaced_repetition_algorithm', 'SM-2').then(setCurrentAlgo).catch(() => {});
  }, [setCurrentAlgo]);

  useEffect(() => {
    AuthService.restore()
      .then(({ hasAccount, username }) => setAuth({ hasAccount, currentUser: username }))
      .catch(() => setAuth({ hasAccount: false, currentUser: null }))
      // Online backup: syncs now, on reconnect and after local changes (no-op offline or signed out)
      .finally(() => CloudSync.start());
  }, [setAuth]);

  useEffect(() => {
    // Send bug reports queued while offline (or before the reporting backend existed)
    void ReportService.flush().catch(() => {});
    const handleOnline = () => {
      setOffline(false);
      void ReportService.flush().catch(() => {});
    };
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOffline]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/quiz/year" element={<QuizByYear />} />
              <Route path="/quiz/topic" element={<QuizByTopic />} />
              <Route path="/quiz/combined" element={<QuizCombined />} />
              <Route path="/quiz/custom" element={<QuizCustom />} />
              <Route path="/quiz/srs" element={<QuizSpacedRepetition />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/history/:id" element={<QuestionHistory />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/news" element={<News />} />
              <Route path="/legal/terms" element={<Terms />} />
              <Route path="/legal/privacy" element={<Privacy />} />
              <Route path="/settings" element={<Navigate to="/profile" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;

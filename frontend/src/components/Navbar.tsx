import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Calendar,
  Layers,
  Filter,
  CheckSquare,
  Repeat,
  BarChart3,
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  Download,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { StatsDbService } from '../services/statsDb';

export const Navbar: React.FC = () => {
  const { isOffline, setOffline, installPrompt, setInstallPrompt } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dueCount, setDueCount] = useState<number>(0);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Check due count periodically
    const checkDue = async () => {
      try {
        const due = await StatsDbService.getDueReviews();
        setDueCount(due.length);
      } catch (err) {
        // ignore
      }
    };
    checkDue();
    const interval = setInterval(checkDue, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      clearInterval(interval);
    };
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    }
  };

  const navLinks = [
    { to: '/quiz/year', label: 'By Year', icon: Calendar, tab: 'Tab 1' },
    { to: '/quiz/topic', label: 'By Topic', icon: Layers, tab: 'Tab 2' },
    { to: '/quiz/combined', label: 'Combined', icon: Filter, tab: 'Tab 3' },
    { to: '/quiz/custom', label: 'Custom Quiz', icon: CheckSquare, tab: 'Tab 4' },
    {
      to: '/quiz/srs',
      label: 'Spaced Repetition',
      icon: Repeat,
      badge: dueCount > 0 ? dueCount : null,
    },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-500 to-purple-600 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white group-hover:text-sky-400 transition-colors">
                SLACKR
              </span>
              <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-400 border border-sky-500/20">
                PHILNITS
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Offline-First Exam Reviewer</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-slate-800 text-sky-400 shadow-sm border border-slate-700/60'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== null && (
                  <span className="ml-1 rounded-full bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.2 text-[10px] font-bold text-rose-300">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Status & PWA Install Button */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Offline/Online Indicator */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${
              isOffline
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}
            title={isOffline ? 'Working in 100% Offline Mode' : 'Connected to Network'}
          >
            {isOffline ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Offline Mode</span>
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Online</span>
              </>
            )}
          </div>

          {/* Install Button if prompted */}
          {installPrompt && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-400 active:scale-95 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Install App</span>
            </button>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-950 px-4 py-4 space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive
                      ? 'bg-slate-800 text-sky-400 border border-slate-700/60'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge !== null && (
                  <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-2 py-0.5 text-xs font-bold text-rose-300">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      )}
    </header>
  );
};

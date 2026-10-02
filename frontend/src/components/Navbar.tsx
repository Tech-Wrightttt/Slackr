import React, { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { StatsDbService } from '../services/statsDb';

export const Navbar: React.FC = () => {
  const { isOffline, setOffline, installPrompt, setInstallPrompt, theme, toggleTheme } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dueCount, setDueCount] = useState<number>(0);
  const location = useLocation();

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
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/quiz/year', label: 'Year Papers', icon: 'calendar_month' },
    { to: '/quiz/topic', label: 'Topics', icon: 'category' },
    { to: '/quiz/combined', label: 'Combined', icon: 'filter_alt' },
    { to: '/quiz/custom', label: 'Custom Builder', icon: 'architecture' },
    {
      to: '/quiz/srs',
      label: 'SRS Queue',
      icon: 'repeat',
      badge: dueCount > 0 ? dueCount : null,
    },
    { to: '/analytics', label: 'Analytics', icon: 'monitoring' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-obsidian-surface/90 dark:bg-obsidian-surface/90 bg-surface/95 backdrop-blur-xl border-b border-outline-variant/30 shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="h-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2 text-on-surface decoration-0 group">
            <img
              src={theme === 'dark' ? '/koala-mascot.png' : '/koala-mascot-light.png'}
              onError={(e) => {
                // Fallback to local SVG if PNG error
                (e.target as HTMLImageElement).src = '/slackr-logo.svg';
              }}
              alt="Slackr Koala Mascot"
              className="w-8 h-8 rounded-lg object-contain shrink-0 group-hover:scale-105 transition-transform"
            />
            <span className="font-headline-md text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
              SLACK<span className="text-primary font-extrabold">R</span>
            </span>
          </Link>
          <span className="px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-label-caps text-[11px] border border-outline-variant/30">
            FE / AP
          </span>
        </div>

        {/* Desktop Nav Matrix */}
        <nav className="hidden xl:flex items-center gap-1 p-1 rounded-xl bg-surface-container-lowest/60 border border-outline-variant/20">
          {navLinks.map((item) => {
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={
                  isActive
                    ? 'px-3 py-1.5 transition-all text-primary font-body-bold text-sm bg-surface-container-high/80 rounded-lg shadow-inner flex items-center gap-1.5'
                    : 'px-3 py-1.5 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5'
                }
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== null && (
                  <span className="px-1.5 py-0.2 rounded-full bg-confidence-amber/20 text-confidence-amber font-mono-timer text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Right Status & Quick Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Dexie offline status badge */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant/30 font-mono-code text-xs text-on-surface-variant"
            title="Local Dexie.js Client Database Telemetry Active"
          >
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                isOffline ? 'bg-confidence-amber' : 'bg-mastery-emerald animate-pulse'
              }`}
            ></span>
            <span>{isOffline ? 'Dexie Offline' : 'Dexie Active'}</span>
          </div>

          {/* Retention / Streak Pill */}
          <Link
            to="/quiz/srs"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant/30 font-mono-timer text-xs text-confidence-amber hover:bg-surface-container transition-colors"
            title="Spaced Repetition Review Queue"
          >
            <span className="material-symbols-outlined text-[16px] text-confidence-amber">
              local_fire_department
            </span>
            <span>{dueCount > 0 ? `${dueCount} DUE` : '14D'}</span>
          </Link>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Theme"
            className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            type="button"
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {theme === 'dark' ? 'light_mode' : 'dark_mode'}
            </span>
          </button>

          {/* Install PWA Button */}
          {installPrompt && (
            <button
              onClick={handleInstallClick}
              className="px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-mono-code text-xs font-semibold flex items-center gap-1 shadow-sm transition-all"
              type="button"
            >
              <span className="material-symbols-outlined text-[14px]">download</span>
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Profile Badge */}
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface"
            type="button"
            aria-label="Toggle Menu"
          >
            <span className="material-symbols-outlined text-[20px]">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-outline-variant/20 bg-surface-container-lowest/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {navLinks.map((item) => {
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileMenuOpen(false)}
                className={
                  isActive
                    ? 'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold bg-surface-container-high text-primary'
                    : 'flex items-center justify-between rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge !== null && (
                  <span className="px-2 py-0.5 rounded-full bg-confidence-amber/20 text-confidence-amber font-mono-timer text-xs font-bold">
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

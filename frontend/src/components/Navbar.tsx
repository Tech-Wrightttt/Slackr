import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { StatsDbService } from '../services/statsDb';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { InstallOfflineButton } from './InstallOfflineButton';
import { StreakMark, streakLabel } from './StreakMark';
import { BrandLogo } from './BrandLogo';
import { hasUnreadNews, NEWS_SEEN_EVENT } from '../services/newsSeen';

// Counters never grow past three characters, so a big review queue can't push the bar around
const compactCount = (n: number) => (n > 99 ? '99+' : String(n));

const ROW_GAP = 12; // gap-3 between brand, nav and controls
const NAV_INSET = 12; // ml-3 on the nav, on top of the gap after the brand

/** The ways to pick questions, grouped under one "Practice" menu so the bar stays short */
const PRACTICE_LINKS = [
  { to: '/quiz/year', label: 'Year Papers', icon: 'calendar_month', hint: 'Past papers by exam sitting' },
  { to: '/quiz/topic', label: 'Topics', icon: 'category', hint: 'Drill one syllabus area' },
  { to: '/quiz/combined', label: 'Combined', icon: 'filter_alt', hint: 'Mix years, papers and topics' },
  { to: '/quiz/custom', label: 'Custom Builder', icon: 'architecture', hint: 'Hand-pick questions and save sets' },
  { to: '/quiz/playlists', label: 'Playlists', icon: 'queue_music', hint: 'Your saved sets, share codes, public picks' },
];

const isPracticePath = (path: string) =>
  path.startsWith('/quiz/') && !path.startsWith('/quiz/srs');

const navItemClass = (active: boolean) =>
  `nav-item relative h-10 px-3 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors ${
    active ? 'text-on-surface bg-surface-container-high/70' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
  }`;

const iconButtonClass =
  'press-scale relative w-10 h-10 shrink-0 rounded-lg bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/30 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer';

export const Navbar: React.FC = () => {
  const { isOffline, setOffline, setInstallPrompt, theme, toggleTheme, currentUser } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [dueCount, setDueCount] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [newsUnread, setNewsUnread] = useState(hasUnreadNews);
  const location = useLocation();

  // The bar measures itself instead of trusting fixed breakpoints: counts, fonts, sign-in state and
  // window size all change widths. When the links don't fit they fold into the menu button. Nothing ever overlaps.
  const rowRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const [navFits, setNavFits] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const cs = getComputedStyle(row);
      const avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const brand = brandRef.current?.offsetWidth ?? 0;
      const nav = navRef.current?.offsetWidth ?? 0;
      const core = coreRef.current?.offsetWidth ?? 0;
      setNavFits(window.innerWidth >= 1024 && brand + ROW_GAP + NAV_INSET + nav + ROW_GAP + core <= avail);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [row, navRef.current, coreRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close the drawer if the links get room again (e.g. rotating a tablet to landscape)
  useEffect(() => {
    if (navFits) setMobileMenuOpen(false);
  }, [navFits]);

  // Any navigation closes the open menus
  useEffect(() => {
    setPracticeOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const refresh = () => setNewsUnread(hasUnreadNews());
    window.addEventListener(NEWS_SEEN_EVENT, refresh);
    return () => window.removeEventListener(NEWS_SEEN_EVENT, refresh);
  }, []);

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
        setStreak((await AnalyticsEngine.getDailyActivity()).currentStreak);
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

  const reviewBadge = dueCount > 0 ? compactCount(dueCount) : null;
  const practiceActive = isPracticePath(location.pathname);

  // Drawer (phones, tablets, narrow windows): every destination, Practice links grouped under a heading
  const drawerSections: { title?: string; links: { to: string; label: string; icon: string; end?: boolean; badge?: string | null; dot?: boolean }[] }[] = [
    { links: [{ to: '/', label: 'Dashboard', icon: 'dashboard', end: true }] },
    { title: 'Practice', links: PRACTICE_LINKS },
    {
      links: [
        { to: '/quiz/srs', label: 'Review', icon: 'repeat', badge: reviewBadge },
        { to: '/analytics', label: 'Analytics', icon: 'monitoring' },
        { to: '/philnits', label: 'About PhilNITS', icon: 'school' },
        { to: '/news', label: 'News', icon: 'campaign', dot: newsUnread },
        { to: '/profile', label: 'Profile & settings', icon: 'person' },
      ],
    },
  ];
  let drawerIndex = 0;

  return (
    <header
      /* Installed PWA on notched phones: keep the bar below the status bar and clear of landscape notches */
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
      className="fixed top-0 left-0 right-0 z-50 bg-surface/95 dark:bg-obsidian-surface/90 backdrop-blur-xl border-b border-outline-variant/30 shadow-[0_1px_8px_rgba(0,0,0,0.4)]"
    >
      <div ref={rowRef} className="relative h-16 max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        {/* Brand + main navigation sit together on the left; tools sit on the right */}
        <div className="flex items-center gap-3 min-w-0">
          <div ref={brandRef} className="shrink-0">
            <Link to="/" aria-label="SLACKR dashboard" className="flex items-center gap-2 text-on-surface decoration-0 rounded-lg">
              <BrandLogo className="w-8 h-8 shrink-0" />
              <span className="font-headline-md text-xl sm:text-2xl font-bold tracking-tight text-on-surface">
                SLACK<span className="text-primary font-extrabold">R</span>
              </span>
            </Link>
          </div>

          {/* Desktop navigation: always rendered so its natural width can be measured; hidden (and out of
              the tab order) whenever it doesn't fit */}
          <nav
            ref={navRef}
            aria-label="Main"
            aria-hidden={!navFits}
            className={`flex w-max shrink-0 items-center gap-1 ml-3 ${navFits ? '' : 'invisible absolute left-0 top-0 pointer-events-none'}`}
          >
            <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)} tabIndex={navFits ? undefined : -1}>
              Dashboard
            </NavLink>

            <PracticeMenu
              open={practiceOpen}
              setOpen={setPracticeOpen}
              active={practiceActive}
              focusable={navFits}
            />

            <NavLink to="/quiz/srs" className={({ isActive }) => navItemClass(isActive)} tabIndex={navFits ? undefined : -1}>
              Review
              {reviewBadge && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-confidence-amber/20 text-confidence-amber font-mono-timer text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
                  {reviewBadge}
                  <span className="sr-only"> due</span>
                </span>
              )}
            </NavLink>
            <NavLink to="/analytics" className={({ isActive }) => navItemClass(isActive)} tabIndex={navFits ? undefined : -1}>
              Analytics
            </NavLink>
            <NavLink to="/philnits" className={({ isActive }) => navItemClass(isActive)} tabIndex={navFits ? undefined : -1}>
              PhilNITS
            </NavLink>
          </nav>
        </div>

        {/* Right: status and tools, measured as one block */}
        <div className="flex items-center gap-2 shrink-0">
          <div ref={coreRef} className="flex items-center gap-2 shrink-0">
            {/* Only shown when it matters: the app keeps working, progress stays on the device */}
            {isOffline && (
              <span
                className="hidden sm:inline-flex h-10 items-center gap-1.5 px-2.5 rounded-lg border border-confidence-amber/30 bg-confidence-amber/10 text-confidence-amber text-xs font-semibold whitespace-nowrap"
                title="You're offline. Everything still works and your progress is saved on this device."
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">cloud_off</span>
                Offline
              </span>
            )}

            {/* Streak, or reviews due */}
            <Link
              to="/quiz/srs"
              className={`hidden min-[400px]:flex h-10 items-center gap-1.5 px-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 font-mono-timer text-xs font-semibold hover:bg-surface-container transition-colors whitespace-nowrap ${
                dueCount > 0 ? 'text-confidence-amber' : 'text-primary'
              }`}
              title={dueCount > 0 ? 'Reviews due today' : `Study streak: ${streakLabel(streak)}`}
            >
              {dueCount > 0 ? (
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">schedule</span>
              ) : (
                <StreakMark active={streak > 0} className="w-4 h-4" />
              )}
              <span className="tabular-nums">{dueCount > 0 ? `${compactCount(dueCount)} due` : streakLabel(streak)}</span>
            </Link>

            {/* News: a dot until this version's notes have been opened */}
            {navFits && (
              <Link
                to="/news"
                aria-label={newsUnread ? 'News, new release notes' : 'News'}
                title={newsUnread ? "What's new: unread release notes" : "What's new"}
                className={`${iconButtonClass} ${location.pathname === '/news' ? 'text-primary' : ''}`}
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">campaign</span>
                {newsUnread && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface-container-low" aria-hidden="true" />
                )}
              </Link>
            )}

            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className={iconButtonClass}
              type="button"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Install + full offline download in one control */}
            <InstallOfflineButton />

            {/* Account: profile and settings live behind the avatar */}
            {navFits && (
              <Link
                to="/profile"
                aria-label={currentUser ? `Profile and settings: ${currentUser}` : 'Profile and settings'}
                title={currentUser ? `${currentUser} · Profile and settings` : 'Profile and settings'}
                className={`press-scale w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                  currentUser
                    ? 'bg-primary text-on-primary font-bold text-sm'
                    : `border border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high ${
                        location.pathname === '/profile' ? 'text-primary border-primary/50' : ''
                      }`
                }`}
              >
                {currentUser ? (
                  <span aria-hidden="true">{currentUser.slice(0, 1).toUpperCase()}</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">person</span>
                )}
              </Link>
            )}

            {/* Guests: one clear way in; Sign in sits beside it on wide screens and in the menu on phones */}
            {!currentUser && (
              <>
                <Link
                  to="/signin"
                  state={{ from: location.pathname }}
                  className="press-scale hidden xl:flex items-center h-10 px-3 rounded-full text-sm font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container whitespace-nowrap"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  state={{ from: location.pathname }}
                  className="press-scale hidden sm:flex items-center gap-1 h-10 px-3.5 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-container whitespace-nowrap"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>

          {/* Menu button: whenever the links don't fit (phones, tablets, narrow windows) */}
          {!navFits && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-controls="nav-drawer"
              className={iconButtonClass}
              type="button"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {mobileMenuOpen ? 'close' : 'menu'}
              </span>
              {!mobileMenuOpen && (newsUnread || reviewBadge) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface-container-low" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Navigation drawer: AnimatePresence gives enter/exit animation */}
      <AnimatePresence initial={false}>
        {mobileMenuOpen && !navFits && (
          <motion.div
            key="mobile-drawer"
            id="nav-drawer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden border-t border-outline-variant/20 bg-surface-container-lowest/95 backdrop-blur-xl"
          >
            {/* Scrolls inside itself so every link stays reachable on short landscape phones */}
            <nav
              aria-label="Main"
              className="max-w-3xl mx-auto px-4 py-3 flex flex-col gap-3 max-h-[calc(100dvh-4rem-env(safe-area-inset-top))] overflow-y-auto overscroll-contain"
            >
              {drawerSections.map((section, si) => (
                <div key={si} className={`flex flex-col gap-1 ${si > 0 ? 'pt-3 border-t border-outline-variant/20' : ''}`}>
                  {section.title && (
                    <p className="px-3 pb-1 text-xs font-semibold text-on-surface-variant">{section.title}</p>
                  )}
                  <div className="grid gap-1 sm:grid-cols-2">
                    {section.links.map((item) => {
                      const i = drawerIndex++;
                      const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                      return (
                        <motion.div
                          key={item.to}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.16, delay: i * 0.025, ease: [0.23, 1, 0.32, 1] }}
                        >
                          <NavLink
                            to={item.to}
                            end={item.end}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`min-h-[48px] flex items-center justify-between gap-3 rounded-xl px-3 text-sm transition-colors ${
                              isActive
                                ? 'font-semibold bg-surface-container-high text-primary'
                                : 'text-on-surface hover:bg-surface-container'
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">
                                {item.icon}
                              </span>
                              <span className="truncate">{item.label}</span>
                            </span>
                            {'badge' in item && item.badge && (
                              <span className="px-2 py-0.5 rounded-full bg-confidence-amber/20 text-confidence-amber font-mono-timer text-xs font-bold">
                                {item.badge} due
                              </span>
                            )}
                            {'dot' in item && item.dot && (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">New</span>
                            )}
                          </NavLink>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Guests: account actions live here on phones, where the bar has no room for them */}
              {!currentUser && (
                <div className="pt-3 border-t border-outline-variant/20 grid grid-cols-2 gap-2">
                  <Link
                    to="/signin"
                    state={{ from: location.pathname }}
                    onClick={() => setMobileMenuOpen(false)}
                    className="press-scale min-h-[48px] flex items-center justify-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-low text-sm font-semibold text-on-surface hover:bg-surface-container"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">login</span>
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    state={{ from: location.pathname }}
                    onClick={() => setMobileMenuOpen(false)}
                    className="press-scale min-h-[48px] flex items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-on-primary hover:bg-primary-container"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person_add</span>
                    Sign up
                  </Link>
                </div>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

/** "Practice" disclosure: a button that opens a short list of the four ways to pick questions */
const PracticeMenu: React.FC<{
  open: boolean;
  setOpen: (open: boolean) => void;
  active: boolean;
  focusable: boolean;
}> = ({ open, setOpen, active, focusable }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Click outside or Escape closes it; Escape hands focus back to the button
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const links = () => [...(wrapRef.current?.querySelectorAll<HTMLAnchorElement>('[data-practice-link]') ?? [])];

  // Arrow keys move between the links; Down on the button opens the list at the first link
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!open) {
      setOpen(true);
      requestAnimationFrame(() => links()[0]?.focus());
      return;
    }
    const all = links();
    const i = all.indexOf(document.activeElement as HTMLAnchorElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % all.length : (i - 1 + all.length) % all.length;
    all[next]?.focus();
  };

  return (
    <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="practice-menu"
        tabIndex={focusable ? undefined : -1}
        onClick={() => setOpen(!open)}
        className={`${navItemClass(active || open)} cursor-pointer`}
        data-active={active || undefined}
      >
        Practice
        <span
          className={`material-symbols-outlined text-[18px] -mr-1 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          id="practice-menu"
          className="practice-menu absolute left-0 top-full mt-2 w-[22rem] rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.45)]"
        >
          <ul className="flex flex-col gap-0.5">
            {PRACTICE_LINKS.map((l) => {
              const current = location.pathname.startsWith(l.to);
              return (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    data-practice-link
                    aria-current={current ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                      current ? 'bg-surface-container-high' : 'hover:bg-surface-container focus-visible:bg-surface-container'
                    }`}
                  >
                    <span
                      className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                        current ? 'bg-primary text-on-primary' : 'bg-primary/12 text-primary'
                      }`}
                      aria-hidden="true"
                    >
                      <span className="material-symbols-outlined text-[20px]">{l.icon}</span>
                    </span>
                    <span className="min-w-0 flex flex-col">
                      <span className="text-sm font-semibold text-on-surface">{l.label}</span>
                      <span className="text-xs text-on-surface-variant">{l.hint}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

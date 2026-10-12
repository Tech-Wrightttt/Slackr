import React, { useEffect, useId, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MotionConfig, motion, useReducedMotion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { AuthService, USERNAME_PATTERN, type AuthResult } from '../services/authService';
import { AccountApi } from '../services/accountApi';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudSync } from '../services/cloudSync';
import { passwordProblem } from '../services/passwordPolicy';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { BlurText, DecryptedText, ShinyText, Squares } from '../components/reactbits';
import { BrandLogo } from '../components/BrandLogo';

type Mode = 'signin' | 'signup';

const COPY: Record<Mode, { eyebrow: string; title: string; subtitle: string; submit: string; pending: string }> = {
  signin: {
    eyebrow: 'WELCOME BACK',
    title: 'Sign in',
    subtitle: 'Pick up your review queue where you left off.',
    submit: 'Sign in',
    pending: 'Signing in…',
  },
  signup: {
    eyebrow: 'OPTIONAL PROFILE',
    title: 'Create a profile',
    subtitle: 'Add a username to this device. Your existing progress carries over.',
    submit: 'Create profile',
    pending: 'Creating…',
  },
};

const FEATURES = [
  { icon: 'library_books', text: '3,609 PhilNITS FE / AP questions, 2007–2026' },
  { icon: 'repeat', text: 'Spaced repetition that schedules your reviews' },
  { icon: 'wifi_off', text: 'Works fully offline once installed' },
];

const Field: React.FC<{
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  hint?: string;
  autoFocus?: boolean;
}> = ({ label, type, value, onChange, autoComplete, hint, autoFocus }) => {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono-code text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="none"
          required
          className="auth-input w-full min-h-[46px] rounded-xl border border-outline-variant/50 bg-surface-container-lowest px-3.5 py-2.5 pr-11 text-base sm:text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="press-scale absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">{reveal ? 'visibility_off' : 'visibility'}</span>
          </button>
        )}
      </div>
      {hint && <p className="font-mono-code text-[11px] text-on-surface-variant/80">{hint}</p>}
    </div>
  );
};

/** Animated brand panel: left column on desktop, a short banner on phones. */
const BrandPanel: React.FC = () => {
  const theme = useStore((s) => s.theme);
  const reduceMotion = useReducedMotion();
  const dark = theme === 'dark';

  return (
    <aside className="auth-brand relative overflow-hidden lg:min-h-dvh">
      {/* Decorative moving grid; static under reduced motion */}
      <div className="absolute inset-0" aria-hidden="true">
        {reduceMotion ? (
          <div className="auth-grid-static h-full w-full" />
        ) : (
          <Squares
            direction="diagonal"
            speed={0.25}
            squareSize={44}
            borderColor={dark ? 'rgba(132, 214, 86, 0.08)' : 'rgba(57, 106, 30, 0.09)'}
            hoverFillColor={dark ? 'rgba(132, 214, 86, 0.10)' : 'rgba(57, 106, 30, 0.07)'}
          />
        )}
      </div>
      {/* Soft glow + fade so the grid reads as texture, not pattern */}
      <div className="auth-brand-glow pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="pointer-events-none relative flex h-full flex-col justify-between gap-8 px-6 pt-6 pb-16 sm:px-10 lg:px-14 lg:py-12">
        <Link to="/" className="pointer-events-auto flex w-fit items-center gap-2.5">
          <BrandLogo alt="" className="h-9 w-9" />
          <span className="font-headline-md text-xl font-bold tracking-tight text-on-surface">
            SLACK<span className="text-primary font-extrabold">R</span>
          </span>
        </Link>

        <div className="flex flex-col gap-4 lg:gap-6 max-w-xl">
          <DecryptedText
            text="PHILNITS · FE / AP REVIEWER"
            animateOn="view"
            sequential
            speed={35}
            parentClassName="font-mono-timer text-[11px] font-semibold tracking-[0.18em]"
            className="text-primary"
            encryptedClassName="text-on-surface-variant/50"
          />
          <h1 className="sr-only">Study at your own pace. Pass with calm.</h1>
          {/* Sequenced headline: words blur in, then letters ripple, then "calm." lands with a shine */}
          <div
            aria-hidden="true"
            className="flex flex-col gap-1 font-display-lg text-[2rem] leading-[1.1] sm:text-5xl lg:text-6xl font-bold tracking-tight text-on-surface"
          >
            <BlurText text="Study at your own pace." animateBy="words" direction="bottom" delay={90} className="gap-x-[0.18em]" />
            <div className="flex flex-wrap items-baseline gap-x-[0.24em]">
              <BlurText
                text="Pass with"
                animateBy="letters"
                direction="bottom"
                delay={35}
                startDelay={560}
                className="text-on-surface-variant [&>span]:mr-0"
              />
              <motion.span
                className="inline-block"
                initial={{ opacity: 0, filter: 'blur(12px)', transform: 'translate3d(0, 18px, 0) scale(0.96)' }}
                animate={{ opacity: 1, filter: 'blur(0px)', transform: 'translate3d(0, 0, 0) scale(1)' }}
                transition={{ duration: 0.7, delay: 1.0, ease: [0.23, 1, 0.32, 1] }}
              >
                <ShinyText text="calm." baseColor="var(--color-primary)" speed={6} shimmerWidth={250} />
              </motion.span>
            </div>
          </div>
          <ul className="hidden sm:flex flex-col gap-3 pt-2">
            {FEATURES.map((f, i) => (
              <li
                key={f.icon}
                className="enter-rise flex items-center gap-3 text-sm text-on-surface-variant"
                style={{ animationDelay: `${500 + i * 70}ms` }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[18px]">{f.icon}</span>
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden lg:block font-mono-code text-[11px] text-on-surface-variant/70">
          Everything stays on this device. Accounts are optional.
        </p>
      </div>
    </aside>
  );
};

const AuthScreen: React.FC<{ mode: Mode }> = ({ mode }) => {
  const { authReady, hasAccount, currentUser, setAuth, isOffline, accountsEnabled } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const profiles = useLiveQuery(() => AuthService.listProfiles(), []) ?? [];

  // Live "username taken?" check against online accounts while signing up (debounced, online only)
  const checkName = mode === 'signup' && accountsEnabled && !isOffline && USERNAME_PATTERN.test(username.trim());
  useEffect(() => {
    if (!checkName) {
      setNameStatus('idle');
      return;
    }
    setNameStatus('checking');
    let cancelled = false;
    const t = setTimeout(() => {
      AccountApi.usernameAvailable(username.trim())
        .then((ok) => !cancelled && setNameStatus(ok ? 'available' : 'taken'))
        .catch(() => !cancelled && setNameStatus('idle'));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [checkName, username]);

  // Seen once this launch: skipping now lets the guest use the app without being sent back here
  useEffect(() => {
    AuthService.markPromptedThisLaunch();
  }, []);

  if (!authReady) return null;
  const from = (location.state as { from?: string } | null)?.from || '/';
  if (currentUser) return <Navigate to={from} replace />;
  const notice = (location.state as { notice?: string } | null)?.notice;
  const showEmail = mode === 'signup' && accountsEnabled;

  const copy = COPY[mode];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    if (mode === 'signup') {
      const problem = passwordProblem(password, username);
      if (problem) return setError(problem);
      if (password !== confirm) return setError('Passwords do not match.');
    }
    setPending(true);
    try {
      let result: AuthResult;
      if (mode === 'signup') {
        const res = await AuthService.signUp({ username, password, email });
        if (res.needsConfirmation) {
          setAuth({ hasAccount: true, currentUser: null });
          navigate('/signin', {
            replace: true,
            state: { from, notice: `Account created. Open the link we emailed to ${email.trim()}, then sign in.` },
          });
          return;
        }
        result = res;
      } else {
        result = await AuthService.signIn(username, password);
      }
      // Another profile's data lives in its own scope: reopen the app on it (sync runs on start)
      if (result.reload) {
        window.location.replace(from);
        return;
      }
      setAuth({ hasAccount: true, currentUser: result.username });
      // Pull this account's online backup (if any) and push the device's data
      CloudSync.reset();
      void CloudSync.sync();
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Something went wrong.');
      setPending(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh w-full bg-surface lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <BrandPanel />

        {/* Form column: top-aligned, left-aligned; overlaps the banner on phones like a sheet */}
        <main className="relative -mt-8 rounded-t-3xl bg-surface px-6 pt-8 pb-10 sm:px-10 lg:mt-0 lg:rounded-none lg:border-l lg:border-outline-variant/30 lg:px-14 lg:pt-12">
          <div className="flex items-center justify-end">
            <Link
              to={from}
              className="press-scale group inline-flex min-h-[40px] items-center gap-1 rounded-full px-3 text-xs font-semibold text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
            >
              Skip for now
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>

          <div className="mt-6 lg:mt-[12vh] w-full max-w-sm">
              <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
                <div className="enter-rise flex flex-col gap-1.5">
                  <span className="font-mono-timer text-[11px] font-semibold tracking-wider text-primary">{copy.eyebrow}</span>
                  <h1 className="font-display-lg text-3xl font-bold tracking-tight text-on-surface">{copy.title}</h1>
                  <p className="text-sm leading-relaxed text-on-surface-variant">
                    {mode === 'signin'
                      ? copy.subtitle
                      : `${showEmail ? 'Add an email to back up your progress and sign in on any device, or leave it empty for a device-only profile. ' : ''}${
                          hasAccount ? 'New profiles start with their own progress.' : 'Your existing progress carries over.'
                        }`}
                  </p>
                </div>

                <div className="enter-rise enter-rise-1 flex flex-col gap-4">
                  <Field
                    label={mode === 'signin' ? 'Username or email' : 'Username'}
                    type="text"
                    value={username}
                    onChange={setUsername}
                    autoComplete="username"
                    autoFocus
                    hint={
                    mode !== 'signup'
                      ? undefined
                      : nameStatus === 'checking'
                      ? 'Checking availability…'
                      : nameStatus === 'available'
                      ? 'Available'
                      : nameStatus === 'taken'
                      ? 'Taken online. Pick another username.'
                      : '3–24 characters: letters, numbers, . - _'
                  }
                  />
                  {showEmail &&
                    (isOffline ? (
                      <p className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-xs leading-relaxed text-on-surface-variant">
                        You're offline. This profile is saved on this device; link it to an online account from Profile
                        when you're back online.
                      </p>
                    ) : (
                      <Field
                        label="Email (optional)"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        autoComplete="email"
                        hint="Backs up your progress and lets you sign in on other devices"
                      />
                    ))}
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                  {mode === 'signup' && <PasswordChecklist password={password} username={username} />}
                  {mode === 'signin' && (
                    <Link
                      to="/forgot-password"
                      state={location.state}
                      className="-mt-2 self-end inline-flex min-h-[40px] items-center text-xs font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  )}
                  {mode === 'signup' && (
                    <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
                  )}
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-container/60 px-3 py-2.5 text-xs leading-relaxed text-on-error-container dark:bg-error/10 dark:text-error"
                  >
                    <span className="material-symbols-outlined text-[16px] shrink-0">error</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="enter-rise enter-rise-2 flex flex-col gap-3">
                  <button
                    type="submit"
                    disabled={pending}
                    className="press-scale min-h-[46px] w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {pending && <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>}
                    <span>{pending ? copy.pending : copy.submit}</span>
                  </button>

                  <div className="flex items-center gap-3 font-mono-code text-[11px] text-on-surface-variant/70" aria-hidden="true">
                    <span className="h-px flex-1 bg-outline-variant/40" />
                    or
                    <span className="h-px flex-1 bg-outline-variant/40" />
                  </div>

                  {/* The launch screen is often sign-in: keep sign-up one tap away, not hidden in fine print */}
                  {mode === 'signin' && (
                    <Link
                      to="/signup"
                      state={location.state}
                      className="press-scale min-h-[46px] w-full rounded-xl border border-primary/50 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-primary/15 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">person_add</span>
                      Create an account
                    </Link>
                  )}

                  <Link
                    to={from}
                    className="press-scale min-h-[46px] w-full rounded-xl border border-outline-variant/50 bg-surface-container-low px-4 py-2.5 text-sm font-semibold text-on-surface hover:bg-surface-container flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">person_off</span>
                    Continue without an account
                  </Link>
                </div>
              </form>

            <div className="mt-6 text-xs leading-relaxed text-on-surface-variant">
              {notice && (
                <p role="status" className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 text-on-surface">
                  {notice}
                </p>
              )}
              {mode === 'signup' ? (
                <p>
                  Guests get every feature. A profile adds a username, a lock on this device
                  {accountsEnabled ? ' and, with an email, an online backup' : ''}.
                  {accountsEnabled && (
                    <>
                      {' '}
                      <Link to="/signin" state={location.state} className="font-semibold text-primary underline-offset-4 hover:underline">
                        Already have an account? Sign in
                      </Link>
                    </>
                  )}
                </p>
              ) : profiles.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="font-mono-code text-[11px] uppercase tracking-wider text-on-surface-variant/80">On this device</p>
                  <div className="flex flex-wrap gap-2">
                    {profiles.map((p) => (
                      <button
                        key={p.username}
                        type="button"
                        onClick={() => setUsername(p.username)}
                        aria-pressed={username === p.username}
                        className={`press-scale min-h-[40px] inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-semibold cursor-pointer ${
                          username === p.username
                            ? 'border-primary bg-primary/10 text-on-surface'
                            : 'border-outline-variant/50 bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                          {p.remoteId ? 'cloud_done' : 'person'}
                        </span>
                        {p.username}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
};

export const SignIn: React.FC = () => <AuthScreen mode="signin" />;
export const SignUp: React.FC = () => <AuthScreen mode="signup" />;

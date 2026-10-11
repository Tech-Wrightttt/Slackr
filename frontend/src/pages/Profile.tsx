import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { AuthService } from '../services/authService';
import { Settings } from './Settings';

export const Profile: React.FC = () => {
  const { currentUser, hasAccount, setAuth } = useStore();
  const navigate = useNavigate();
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    AuthService.getAccount()
      .then((acc) => setCreatedAt(acc?.createdAt ?? null))
      .catch(() => {});
  }, [currentUser]);

  const handleSignOut = () => {
    AuthService.signOut();
    // Signing out drops back to guest mode; study data on this device stays
    setAuth({ currentUser: null });
    navigate('/', { replace: true });
  };

  return (
    <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8 enter-rise">
      {/* Profile */}
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-md flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div
            className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full bg-primary-container text-on-primary-container dark:bg-primary/15 dark:text-primary ring-1 ring-outline-variant/40 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined text-[36px] sm:text-[44px]">person</span>
          </div>
          <div className="min-w-0">
            <span className="font-mono-timer text-[11px] font-semibold tracking-wider text-primary">PROFILE</span>
            <h1 className="font-display-lg text-2xl sm:text-3xl font-bold tracking-tight text-on-surface truncate">
              {currentUser ?? 'Guest'}
            </h1>
            <p className="font-mono-code text-xs text-on-surface-variant">
              {currentUser
                ? `Local profile${createdAt ? ` · since ${new Date(createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}` : ''}`
                : 'Progress is saved on this device. A profile is optional.'}
            </p>
          </div>
        </div>

        {currentUser ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="press-scale self-start sm:self-auto min-h-[44px] flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-container px-4 py-2.5 text-xs font-mono-code text-on-surface hover:bg-surface-container-high cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span>Sign out</span>
          </button>
        ) : (
          <Link
            to={hasAccount ? '/signin' : '/signup'}
            state={{ from: '/profile' }}
            className="press-scale self-start sm:self-auto min-h-[44px] flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary hover:bg-primary-container"
          >
            <span className="material-symbols-outlined text-[16px]">login</span>
            <span>{hasAccount ? 'Sign in' : 'Create profile'}</span>
          </Link>
        )}
      </section>

      <Settings />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { AuthService } from '../services/authService';
import { Settings } from './Settings';
import { ReportDialog } from '../components/ReportDialog';
import { REPORT_CATEGORIES } from '../services/reportService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export const Profile: React.FC = () => {
  const { currentUser, hasAccount, setAuth } = useStore();
  const navigate = useNavigate();
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const reports = useLiveQuery(() => db.reports.orderBy('createdAt').reverse().limit(5).toArray(), []);
  const queuedCount = useLiveQuery(() => db.reports.where('status').equals('queued').count(), []) ?? 0;

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

      {/* Bug reports: question/explanation flags live on each question; this is for everything else */}
      <section
        aria-labelledby="report-bug-title"
        className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-md flex flex-col gap-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span className="material-symbols-outlined text-[22px] text-error mt-0.5" aria-hidden="true">bug_report</span>
            <div className="min-w-0">
              <h2 id="report-bug-title" className="font-title-sm text-base font-bold text-on-surface">
                Report a bug
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Something broken, slow or confusing? Tell us. Use the bug button on a question to report a wrong answer or
                explanation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReporting(true)}
            aria-haspopup="dialog"
            className="press-scale self-start sm:self-auto min-h-[44px] flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-on-primary hover:bg-primary-container cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add_comment</span>
            <span>New report</span>
          </button>
        </div>

        {reports && reports.length > 0 && (
          <div className="border-t border-outline-variant/20 pt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-mono-timer text-[11px] font-semibold tracking-wider text-on-surface-variant">
                YOUR RECENT REPORTS
              </h3>
              {queuedCount > 0 && (
                <span className="font-mono-code text-[11px] text-confidence-amber">
                  {queuedCount} waiting to send
                </span>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {reports.map((r) => {
                const label =
                  REPORT_CATEGORIES[r.kind].find((c) => c.id === r.category)?.label ?? r.category;
                return (
                  <li
                    key={r.clientId}
                    className="flex items-center gap-3 rounded-xl bg-surface-container px-3 py-2.5 min-w-0"
                  >
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant shrink-0" aria-hidden="true">
                      {r.kind === 'general' ? 'bug_report' : r.kind === 'explanation' ? 'article' : 'quiz'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-on-surface truncate">
                        {label}
                        {r.questionId && (
                          <span className="font-mono-code text-xs text-on-surface-variant">
                            {' · '}
                            {r.kind === 'explanation' ? 'explanation of ' : ''}
                            {r.questionId}
                          </span>
                        )}
                      </p>
                      <p className="font-mono-code text-[11px] text-on-surface-variant">
                        {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono-code text-[11px] ${
                        r.status === 'sent'
                          ? 'bg-mastery-emerald/10 text-mastery-emerald'
                          : 'bg-confidence-amber/15 text-confidence-amber'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                        {r.status === 'sent' ? 'done' : 'schedule'}
                      </span>
                      {r.status === 'sent' ? 'Sent' : 'Queued'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {reporting && <ReportDialog kind="general" onClose={() => setReporting(false)} />}

      <Settings />
    </div>
  );
};

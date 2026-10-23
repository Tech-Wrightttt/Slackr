import React, { useState } from 'react';
import { Sheet } from './Sheet';
import { useOnlineNow } from '../services/presence';
import { useStore } from '../store/useStore';

/** Initials shown in the strip before the count */
const STACK = 3;

const initial = (name: string) => name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '?';

const Avatar: React.FC<{ name: string; className?: string }> = ({ name, className = '' }) => (
  <span
    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-container-high font-body-bold text-[11px] text-on-surface ${className}`}
    aria-hidden="true"
  >
    {initial(name)}
  </span>
);

/**
 * Who is studying now, for the dashboard's status strip: a few initials and a count, in the strip's
 * own type. Tap for everyone by username (guests are only counted). Hidden offline or without a backend.
 */
export const OnlineNow: React.FC = () => {
  const now = useOnlineNow();
  const me = useStore((s) => s.currentUser)?.toLowerCase();
  const [open, setOpen] = useState(false);

  if (!now || now.online < 1) return null;

  // You first, then everyone else in the server's alphabetical order
  const users = [...now.users].sort((a, b) => Number(b.toLowerCase() === me) - Number(a.toLowerCase() === me));
  const guests = Math.max(0, now.online - users.length);
  const label = `${now.online.toLocaleString()} studying now`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label}. Show who`}
        className="tap-area relative -my-1 flex items-center gap-2 rounded-lg px-1.5 py-1 font-mono-code text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface cursor-pointer"
      >
        {users.length > 0 ? (
          <span className="flex -space-x-1.5">
            {users.slice(0, STACK).map((u) => (
              <Avatar key={u} name={u} className="ring-2 ring-surface-container-low" />
            ))}
          </span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-mastery-emerald" aria-hidden="true" />
        )}
        <span className="whitespace-nowrap">
          <span className="font-bold text-mastery-emerald tabular-nums">{now.online.toLocaleString()}</span> studying now
        </span>
      </button>

      {open && (
        <Sheet title="Studying now" subtitle={`${now.online.toLocaleString()} online · updates every hour`} icon="group" onClose={() => setOpen(false)}>
          {users.length > 0 ? (
            <ul className="flex flex-col">
              {users.map((u) => (
                <li key={u} className="flex min-h-[44px] items-center gap-3 border-b border-outline-variant/15 last:border-b-0">
                  <Avatar name={u} className="h-8 w-8 text-xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-on-surface">{u}</span>
                  {u.toLowerCase() === me && <span className="text-xs text-on-surface-variant">You</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-on-surface-variant">Nobody signed in is studying right now.</p>
          )}
          {guests > 0 && (
            <p className="mt-3 text-sm text-on-surface-variant tabular-nums">
              {users.length > 0 ? 'Plus ' : ''}
              {guests.toLocaleString()} {guests === 1 ? 'guest' : 'guests'}
              {users.length > 0 ? '.' : ' studying without an account.'}
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-on-surface-variant">
            Signed-in reviewers appear by username. Guests are counted but never named.
          </p>
        </Sheet>
      )}
    </>
  );
};

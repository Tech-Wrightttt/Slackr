import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountApiError } from '../services/accountApi';
import { AdminApi, type OnlineNow, type Playlist, type PlaylistVisibility } from '../services/communityApi';
import { LearningResourcesService, type LearningResource } from '../services/learningResourcesService';
import { QuestionsService } from '../services/questionsService';
import { topicLabel } from '../services/topicColors';
import { CUSTOM_SETS_KEY } from '../db';
import { BrandLogo } from '../components/BrandLogo';
import { useStore } from '../store/useStore';

const inputClass =
  'min-h-[44px] w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none';
const labelClass = 'text-xs font-semibold text-on-surface';
const primaryBtn =
  'press-scale min-h-[44px] rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-fixed-dim disabled:opacity-50 cursor-pointer';
const quietBtn =
  'press-scale min-h-[44px] rounded-xl bg-surface-container-high px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-50 cursor-pointer';
const iconBtn =
  'tap flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer';

const errorText = (err: unknown) =>
  err instanceof AccountApiError ? (err.isNetwork ? "Can't reach the server." : err.message) : 'Something went wrong.';

const timeAgo = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
};

type Tab = 'online' | 'playlists' | 'resources';
const TABS: Array<[Tab, string, string]> = [
  ['online', 'Online', 'group'],
  ['playlists', 'Playlists', 'queue_music'],
  ['resources', 'Resources', 'menu_book'],
];

/** Standalone frame: brand and a way back, no app navigation, account menu or profile. */
const AdminFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex min-h-dvh flex-col bg-surface-container-lowest text-on-surface">
    <header
      className="sticky top-0 z-30 border-b border-outline-variant/20 bg-surface-container-lowest/90 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <span className="flex items-center gap-2 font-bold">
          <BrandLogo className="h-7 w-7" />
          SLACKR <span className="font-normal text-on-surface-variant">Admin</span>
        </span>
        <Link to="/" className="tap inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:underline underline-offset-2">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
          Back to SLACKR
        </Link>
      </div>
    </header>
    <main className="flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>{children}</main>
  </div>
);

/** /admin: the one built-in admin account edits what every visitor sees. Not linked from the app. */
export const Admin: React.FC = () => (
  <AdminFrame>
    <AdminConsole />
  </AdminFrame>
);

const AdminConsole: React.FC = () => {
  const [status, setStatus] = useState<{ admin: boolean; configured: boolean; supabase: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('online');

  const setIsAdmin = useStore((s) => s.setIsAdmin);
  const refresh = useCallback(() => {
    AdminApi.me()
      .then((s) => {
        setStatus(s);
        setIsAdmin(s.admin);
      })
      .catch((err) => setError(errorText(err)));
  }, [setIsAdmin]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    document.title = 'Admin · SLACKR';
    // Keep the console out of search engines
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (!status) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-on-surface-variant" role="status">
        {error ?? 'Checking admin session…'}
      </div>
    );
  }

  if (!status.admin) return <AdminSignIn configured={status.configured} onSignedIn={refresh} />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-8 pb-20 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display-lg text-3xl font-bold tracking-tight text-on-surface">Admin console</h1>
          <p className="text-sm text-on-surface-variant">Changes here are what every visitor sees.</p>
        </div>
        <button
          type="button"
          onClick={() => AdminApi.logout().finally(refresh)}
          className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl border border-outline-variant/40 px-4 text-sm font-semibold text-on-surface hover:bg-surface-container cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          Sign out
        </button>
      </header>

      {!status.supabase && (
        <p className="break-words rounded-xl border border-confidence-amber/40 bg-confidence-amber/10 px-4 py-3 text-sm text-on-surface [&_code]:break-all">
          Supabase admin access isn't set up, so playlists and the online list are unavailable and resource edits save to the
          local JSON files only. Run <code className="font-mono-code">supabase/migrations/0004_playlists_presence_admin.sql</code>{' '}
          and set <code className="font-mono-code">SUPABASE_ADMIN_KEY</code> on the backend.
        </p>
      )}

      <div role="tablist" aria-label="Admin sections" className="flex gap-1 rounded-xl bg-surface-container p-1">
        {TABS.map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`tap flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 sm:px-3 text-sm font-semibold transition-colors cursor-pointer ${
              tab === value ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined hidden text-[18px] min-[420px]:inline" aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'online' && <OnlinePanel />}
        {tab === 'playlists' && <PlaylistsPanel />}
        {tab === 'resources' && <ResourcesPanel />}
      </div>
    </div>
  );
};

/* ── Sign in ──────────────────────────────────────────────────────────────── */

const AdminSignIn: React.FC<{ configured: boolean; onSignedIn: () => void }> = ({ configured, onSignedIn }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await AdminApi.login(username, password);
      setPassword('');
      onSignedIn();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 pt-16 pb-20">
      <div className="flex flex-col gap-1 text-center">
        <span className="material-symbols-outlined mx-auto text-[32px] text-primary" aria-hidden="true">admin_panel_settings</span>
        <h1 className="text-2xl font-bold text-on-surface">Admin sign-in</h1>
        <p className="text-sm text-on-surface-variant">For the SLACKR maintainer only. Signing in here signs this browser out of any study account.</p>
      </div>
      {!configured ? (
        <p className="rounded-xl bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
          Admin sign-in isn't set up on this server. Set <code className="font-mono-code">SLACKR_ADMIN_PASSWORD_HASH</code> on the backend.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-user" className={labelClass}>Username</label>
            <input id="admin-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-pass" className={labelClass}>Password</label>
            <input id="admin-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className={inputClass} />
          </div>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button type="submit" disabled={busy} className={primaryBtn}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </div>
  );
};

/* ── Online now ───────────────────────────────────────────────────────────── */

const OnlinePanel: React.FC = () => {
  const [data, setData] = useState<OnlineNow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      AdminApi.online()
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((err) => setError(errorText(err)));
    void load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (error) return <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>;
  if (!data) return <p className="py-10 text-center text-sm text-on-surface-variant" role="status">Loading…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ['Online now', data.total],
            ['Signed in', data.users.length],
            ['Guests', data.guests],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4">
            <p className="text-xs font-semibold text-on-surface-variant">{label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-on-surface">{n}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-on-surface-variant">Open tabs seen in the last 2 minutes. Refreshes every 30 seconds.</p>
      {data.users.length > 0 ? (
        <ul className="divide-y divide-outline-variant/15 rounded-2xl border border-outline-variant/30 bg-surface-container-low">
          {data.users.map((u, i) => (
            <li key={`${u.username}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 font-semibold text-on-surface">
                <span className="h-2 w-2 rounded-full bg-mastery-emerald" aria-hidden="true" />
                {u.username}
              </span>
              <span className="text-xs text-on-surface-variant tabular-nums">{timeAgo(u.last_seen)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">No signed-in users right now.</p>
      )}
    </div>
  );
};

/* ── Playlists ────────────────────────────────────────────────────────────── */

interface Draft {
  code?: string;
  title: string;
  description: string;
  ids: string;
  visibility: PlaylistVisibility;
  featured: boolean;
}

const EMPTY_DRAFT: Draft = { title: '', description: '', ids: '', visibility: 'public', featured: true };
const parseIds = (text: string) => text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);

const readLocalPresets = (): Record<string, string[]> => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_SETS_KEY) || '{}');
  } catch {
    return {};
  }
};

const PlaylistsPanel: React.FC = () => {
  const [list, setList] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [knownIds, setKnownIds] = useState<Set<string> | null>(null);
  const presets = useMemo(readLocalPresets, []);

  const load = useCallback(() => {
    AdminApi.playlists()
      .then(setList)
      .catch((err) => setError(errorText(err)));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    QuestionsService.loadAllQuestions()
      .then((m) => setKnownIds(new Set(Object.keys(m))))
      .catch(() => {});
  }, []);

  const draftIds = draft ? parseIds(draft.ids) : [];
  const unknown = knownIds ? draftIds.filter((id) => !knownIds.has(id)) : [];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await AdminApi.savePlaylist({
        code: draft.code,
        title: draft.title.trim(),
        description: draft.description.trim(),
        question_ids: draftIds,
        visibility: draft.visibility,
        featured: draft.featured,
      });
      setDraft(null);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const update = async (p: Playlist, change: Partial<Pick<Playlist, 'featured' | 'visibility'>>) => {
    try {
      await AdminApi.savePlaylist({
        code: p.code,
        title: p.title,
        description: p.description,
        question_ids: p.question_ids,
        visibility: change.visibility ?? p.visibility,
        featured: change.featured ?? p.featured,
      });
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const remove = async (p: Playlist) => {
    if (!window.confirm(`Delete "${p.title}" (${p.code}) for everyone? This can't be undone.`)) return;
    try {
      await AdminApi.deletePlaylist(p.code);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error && <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>}

      {draft ? (
        <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5">
          <h2 className="text-base font-bold text-on-surface">{draft.code ? `Edit ${draft.code}` : 'New official playlist'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pl-title" className={labelClass}>Title</label>
              <input id="pl-title" value={draft.title} maxLength={60} required onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pl-preset" className={labelClass}>Fill from a preset on this device</label>
              <select
                id="pl-preset"
                value=""
                onChange={(e) => {
                  const ids = presets[e.target.value];
                  if (ids) setDraft({ ...draft, ids: ids.join('\n'), title: draft.title || e.target.value });
                }}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">{Object.keys(presets).length ? 'Choose a preset…' : 'No presets saved here'}</option>
                {Object.entries(presets).map(([name, ids]) => (
                  <option key={name} value={name}>{name} ({ids.length})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pl-desc" className={labelClass}>Description</label>
            <textarea id="pl-desc" rows={2} maxLength={280} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={`${inputClass} py-2.5 resize-none`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pl-ids" className={labelClass}>
              Question IDs <span className="font-normal text-on-surface-variant">(one per line or comma separated · {draftIds.length})</span>
            </label>
            <textarea
              id="pl-ids"
              rows={6}
              value={draft.ids}
              onChange={(e) => setDraft({ ...draft, ids: e.target.value })}
              placeholder={'2024S_FE_AM_Q15\n2023A_FE_PM_Q2_SQ1'}
              className={`${inputClass} py-2.5 font-mono-code text-xs`}
            />
            {unknown.length > 0 && (
              <p className="text-xs text-confidence-amber">
                Not in the question bank: {unknown.slice(0, 5).join(', ')}
                {unknown.length > 5 ? ` and ${unknown.length - 5} more` : ''}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-on-surface cursor-pointer">
              <input type="checkbox" checked={draft.featured} onChange={(e) => setDraft({ ...draft, featured: e.target.checked })} className="h-4 w-4 accent-primary" />
              Featured (pinned at the top)
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={draft.visibility === 'public'}
                onChange={(e) => setDraft({ ...draft, visibility: e.target.checked ? 'public' : 'unlisted' })}
                className="h-4 w-4 accent-primary"
              />
              Listed publicly
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setDraft(null)} className={quietBtn}>Cancel</button>
            <button type="submit" disabled={saving || !draft.title.trim() || draftIds.length === 0} className={primaryBtn}>
              {saving ? 'Saving…' : 'Save playlist'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setDraft(EMPTY_DRAFT)} className={`${primaryBtn} self-start flex items-center gap-2`}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
          New official playlist
        </button>
      )}

      {list === null ? (
        !error && <p className="py-10 text-center text-sm text-on-surface-variant" role="status">Loading playlists…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No playlists yet.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/15 rounded-2xl border border-outline-variant/30 bg-surface-container-low">
          {list.map((p) => (
            <li key={p.code} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono-code text-xs font-bold text-primary">{p.code}</span>
                  <span className="truncate text-sm font-semibold text-on-surface">{p.title}</span>
                  {p.featured && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Featured</span>}
                  {p.visibility === 'unlisted' && <span className="rounded bg-surface-container-high px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">Link only</span>}
                </div>
                <p className="mt-0.5 text-xs text-on-surface-variant tabular-nums">
                  {p.question_ids.length} questions · by {p.owner_name || 'unknown'} · {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1 self-end sm:self-auto">
                <button type="button" onClick={() => update(p, { featured: !p.featured })} aria-label={p.featured ? `Unfeature ${p.title}` : `Feature ${p.title}`} className={iconBtn}>
                  <span className="material-symbols-outlined text-[18px]" style={p.featured ? { fontVariationSettings: "'FILL' 1" } : undefined} aria-hidden="true">star</span>
                </button>
                <button
                  type="button"
                  onClick={() => update(p, { visibility: p.visibility === 'public' ? 'unlisted' : 'public' })}
                  aria-label={p.visibility === 'public' ? `Hide ${p.title} from the public list` : `List ${p.title} publicly`}
                  className={iconBtn}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{p.visibility === 'public' ? 'visibility' : 'visibility_off'}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({ code: p.code, title: p.title, description: p.description, ids: p.question_ids.join('\n'), visibility: p.visibility, featured: p.featured })
                  }
                  aria-label={`Edit ${p.title}`}
                  className={iconBtn}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
                </button>
                <button type="button" onClick={() => remove(p)} aria-label={`Delete ${p.title}`} className={`${iconBtn} hover:!bg-error/10 hover:!text-error`}>
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ── Learning resources ───────────────────────────────────────────────────── */

type Scope = 'topic' | 'question';

const ResourcesPanel: React.FC = () => {
  const [topics, setTopics] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>('topic');
  const [key, setKey] = useState('');
  const [items, setItems] = useState<LearningResource[]>([]);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const reload = useCallback(async (s: Scope, k: string) => {
    const data = await LearningResourcesService.loadAll();
    const bucket = s === 'topic' ? data.topics : data.questions;
    setItems(k ? (bucket[s === 'topic' ? k.toLowerCase() : k] ?? []) : []);
    setCounts(Object.fromEntries(Object.entries(data.topics).map(([t, l]) => [t, l.length])));
  }, []);

  useEffect(() => {
    QuestionsService.loadAllQuestions()
      .then((m) => {
        const all = new Set<string>();
        Object.values(m).forEach((q) => q.topics?.forEach((t) => all.add(t.toLowerCase())));
        const sorted = [...all].sort();
        setTopics(sorted);
        setKey((k) => k || sorted[0] || '');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    void reload(scope, key.trim());
  }, [scope, key, reload]);

  const saved = () =>
    setNotice(
      LearningResourcesService.lastSavedRemotely
        ? { ok: true, text: 'Saved. Everyone sees it on their next visit.' }
        : { ok: false, text: "Saved on this device only: the server didn't accept it. It retries when you reconnect." }
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const k = key.trim();
    if (!k || !label.trim() || !/^https?:\/\//i.test(url.trim())) {
      setNotice({ ok: false, text: 'Add a label and a link that starts with http:// or https://.' });
      return;
    }
    if (editing) await LearningResourcesService.updateResource(editing, { label, url });
    else await LearningResourcesService.addResource({ label, url, targetType: scope, targetKey: k });
    setLabel('');
    setUrl('');
    setEditing(null);
    saved();
    await reload(scope, k);
  };

  const remove = async (item: LearningResource) => {
    if (!window.confirm(`Remove "${item.label}"?`)) return;
    await LearningResourcesService.deleteResource(item.id);
    saved();
    await reload(scope, key.trim());
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-on-surface-variant">
        Links shown under "Learn more" after answering. Topic links appear on every question in that topic; question links on
        one question only. Analytical breakdowns are edited on the question itself while signed in here.
      </p>

      <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="res-scope" className={labelClass}>Attach to</label>
          <select
            id="res-scope"
            value={scope}
            onChange={(e) => {
              const s = e.target.value as Scope;
              setScope(s);
              setKey(s === 'topic' ? topics[0] || '' : '');
              setEditing(null);
            }}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="topic">A topic</option>
            <option value="question">One question</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="res-key" className={labelClass}>{scope === 'topic' ? 'Topic' : 'Question ID'}</label>
          {scope === 'topic' ? (
            <select id="res-key" value={key} onChange={(e) => setKey(e.target.value)} className={`${inputClass} cursor-pointer`}>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {topicLabel(t)} ({counts[t] ?? 0})
                </option>
              ))}
            </select>
          ) : (
            <input id="res-key" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="2024S_FE_AM_Q15" className={`${inputClass} font-mono-code`} />
          )}
        </div>
      </div>

      <ul className="divide-y divide-outline-variant/15 rounded-2xl border border-outline-variant/30 bg-surface-container-low">
        {items.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-on-surface-variant">No links here yet.</li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-on-surface">{item.label}</p>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">
                  {item.url}
                </a>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(item.id);
                  setLabel(item.label);
                  setUrl(item.url);
                }}
                aria-label={`Edit ${item.label}`}
                className={iconBtn}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
              </button>
              <button type="button" onClick={() => remove(item)} aria-label={`Remove ${item.label}`} className={`${iconBtn} hover:!bg-error/10 hover:!text-error`}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">delete</span>
              </button>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="res-label" className={labelClass}>Label</label>
          <input id="res-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Subnetting explained" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="res-url" className={labelClass}>Link</label>
          <input id="res-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={inputClass} />
        </div>
        <div className="flex gap-2">
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setLabel('');
                setUrl('');
              }}
              className={quietBtn}
            >
              Cancel
            </button>
          )}
          <button type="submit" disabled={!key.trim()} className={primaryBtn}>
            {editing ? 'Update' : 'Add link'}
          </button>
        </div>
      </form>

      {notice && (
        <p role="status" className={`text-sm ${notice.ok ? 'text-mastery-emerald' : 'text-confidence-amber'}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
};

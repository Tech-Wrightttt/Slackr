import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from './Sheet';
import { AccountApiError } from '../services/accountApi';
import { MAX_PLAYLIST_QUESTIONS, PlaylistApi, isPlaylistCode, type Playlist, type PlaylistVisibility } from '../services/communityApi';

export const errorText = (err: unknown) =>
  err instanceof AccountApiError
    ? err.isNetwork
      ? "Can't reach SLACKR right now. Playlists need a connection; your presets still work offline."
      : err.message
    : 'Something went wrong. Try again.';

export const playlistLink = (code: string) => `${window.location.origin}/quiz/playlists?code=${code}`;

export const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const inputClass =
  'min-h-[44px] w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:outline-none';

/* ── Open by code ─────────────────────────────────────────────────────────── */

export const PlaylistCodeForm: React.FC<{ onLoaded: (p: Playlist) => void }> = ({ onLoaded }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPlaylistCode(code)) {
      setError('Codes are 6 letters and numbers, like K7Q2MX.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onLoaded(await PlaylistApi.byCode(code));
      setCode('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <label htmlFor="pl-code" className="text-xs font-semibold text-on-surface-variant">
        Have a code?
      </label>
      <div className="flex gap-1.5">
        <input
          id="pl-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          placeholder="K7Q2MX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          aria-invalid={!!error}
          aria-describedby={error ? 'pl-code-error' : undefined}
          className={`${inputClass} font-mono-code tracking-[0.2em] uppercase`}
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="press-scale min-h-[44px] shrink-0 rounded-xl bg-surface-container-high px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-40 cursor-pointer"
        >
          {busy ? 'Opening…' : 'Open'}
        </button>
      </div>
      {error && (
        <p id="pl-code-error" role="alert" className="text-[11px] leading-snug text-error">
          {error}
        </p>
      )}
    </form>
  );
};

/* ── Share a preset ───────────────────────────────────────────────────────── */

export const SharePlaylistSheet: React.FC<{
  name: string;
  questionIds: string[];
  existingCode?: string;
  onShared: (code: string | null) => void;
  onClose: () => void;
}> = ({ name, questionIds, existingCode, onShared, onClose }) => {
  const [title, setTitle] = useState(name.slice(0, 60));
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<PlaylistVisibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(existingCode ?? null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const newCode = await PlaylistApi.share({ title: title.trim(), description: description.trim(), question_ids: questionIds, visibility });
      setCode(newCode);
      onShared(newCode);
    } catch (err) {
      setError(err instanceof AccountApiError && err.status === 401 ? 'signin' : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const copyIt = async (what: 'code' | 'link') => {
    if (code && (await copyText(what === 'code' ? code : playlistLink(code)))) setCopied(what);
  };

  return (
    <Sheet title={code ? 'Playlist shared' : 'Share preset'} subtitle={`${name} · ${questionIds.length} questions`} icon="share" onClose={onClose}>
      {code ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center" role="status">
          <p className="text-sm text-on-surface-variant">Anyone can open it in the Custom Builder with this code.</p>
          <p className="font-mono-code text-3xl font-bold tracking-[0.3em] text-primary select-all">{code}</p>
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              data-autofocus
              onClick={() => copyIt('code')}
              className="press-scale min-h-[44px] rounded-xl bg-primary text-sm font-semibold text-on-primary hover:bg-primary-fixed-dim cursor-pointer"
            >
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
            <button
              type="button"
              onClick={() => copyIt('link')}
              className="press-scale min-h-[44px] rounded-xl bg-surface-container-high text-sm font-semibold text-on-surface hover:bg-surface-container-highest cursor-pointer"
            >
              {copied === 'link' ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <p className="text-[11px] text-on-surface-variant">
            The shared copy doesn't change when you edit this preset. Share again to publish a new version.
          </p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <button type="button" onClick={() => setCode(null)} className="tap min-h-[44px] text-xs font-semibold text-primary hover:underline cursor-pointer">
              Share a new version
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Stop sharing ${code}? The code stops working for everyone.`)) return;
                try {
                  await PlaylistApi.remove(code);
                } catch (err) {
                  // Not ours (saved from someone else's code) or already gone: just forget it here
                  if (!(err instanceof AccountApiError) || err.status !== 404) {
                    setError(errorText(err));
                    return;
                  }
                }
                onShared(null);
                onClose();
              }}
              className="tap min-h-[44px] text-xs font-semibold text-error hover:underline cursor-pointer"
            >
              Stop sharing
            </button>
          </div>
          {error && <p role="alert" className="text-xs text-error">{error}</p>}
        </div>
      ) : questionIds.length > MAX_PLAYLIST_QUESTIONS ? (
        <div className="flex flex-col gap-2 py-4">
          <p className="text-sm font-semibold text-on-surface">Too many questions to share</p>
          <p className="text-sm text-on-surface-variant">
            Shared playlists hold up to {MAX_PLAYLIST_QUESTIONS} questions; this one has {questionIds.length.toLocaleString()}. Edit
            it in the Custom Builder to trim it, or split it into smaller playlists.
          </p>
        </div>
      ) : error === 'signin' ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="max-w-xs text-sm text-on-surface-variant">
            Sharing needs an online account so you can remove the playlist later. Your preset stays private on this device until then.
          </p>
          <Link to="/signin" className="press-scale min-h-[44px] inline-flex items-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="share-title" className="text-xs font-semibold text-on-surface">
              Title
            </label>
            <input id="share-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="share-desc" className="text-xs font-semibold text-on-surface">
              Description <span className="font-normal text-on-surface-variant">(optional)</span>
            </label>
            <textarea
              id="share-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="What it covers, who it's for"
              className={`${inputClass} py-2.5 resize-none`}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-xs font-semibold text-on-surface">Who can find it</legend>
            {(
              [
                ['public', 'Public', 'Listed under Playlists for everyone, and opens with its code.'],
                ['unlisted', 'Link only', 'Not listed. Only people you give the code or link can open it.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className={`report-choice flex items-start gap-3 rounded-xl border p-3 cursor-pointer ${
                  visibility === value ? 'border-primary bg-primary/10' : 'border-outline-variant/40 bg-surface-container-low hover:bg-surface-container'
                }`}
              >
                <input
                  type="radio"
                  name="share-visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-on-surface">{label}</span>
                  <span className="text-xs text-on-surface-variant">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="press-scale min-h-[44px] rounded-xl bg-primary text-sm font-semibold text-on-primary hover:bg-primary-fixed-dim disabled:opacity-50 cursor-pointer"
          >
            {busy ? 'Sharing…' : 'Share and get a code'}
          </button>
        </form>
      )}
    </Sheet>
  );
};

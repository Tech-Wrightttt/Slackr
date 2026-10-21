import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { QuizSession } from '../components/QuizSession';
import { ExamLaunchButton } from '../components/ExamLaunchButton';
import { Sheet } from '../components/Sheet';
import { PlaylistCodeForm, SharePlaylistSheet, errorText } from '../components/PlaylistSheets';
import { PlaylistApi, isPlaylistCode, type Playlist, type PlaylistSummary } from '../services/communityApi';
import { MINUTES_PER_QUESTION, Presets, type LocalPlaylist } from '../services/presets';
import { customSetKey } from '../services/examService';
import { topicLabel } from '../services/topicColors';
import { useStore } from '../store/useStore';
import type { QuestionData } from '../db/schema';

type Tab = 'mine' | 'public';
type QuestionMap = Record<string, QuestionData>;

const primaryBtn =
  'press-scale inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-sm hover:bg-primary-fixed-dim disabled:opacity-50 cursor-pointer';
const quietBtn =
  'press-scale inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-surface-container-high px-4 text-sm font-semibold text-on-surface hover:bg-surface-container-highest disabled:opacity-50 cursor-pointer';
const iconBtn =
  'tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer';

/** Questions this bank has, in exam order; IDs from a newer bank are skipped */
const resolve = (ids: string[], bank: QuestionMap) =>
  QuestionsService.sortQuestionsStrict(ids.map((id) => bank[id]).filter((q): q is QuestionData => !!q));

/** The 3 most common topics in a set, for a one-line summary */
const topTopics = (ids: string[], bank: QuestionMap) => {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const t = bank[id]?.topics?.[0];
    if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => topicLabel(t));
};

const minutes = (n: number) => Math.max(1, Math.round(n * MINUTES_PER_QUESTION));

/** /quiz/playlists: saved sets on this device, public playlists, and opening a share code. */
export const QuizPlaylists: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'public' ? 'public' : 'mine';
  const { hideAnswersInCustomQuiz, isOffline } = useStore();

  const [bank, setBank] = useState<QuestionMap | null>(null);
  const [mine, setMine] = useState<LocalPlaylist[]>(() => Presets.list());
  const [publicList, setPublicList] = useState<PlaylistSummary[] | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Playlist | null>(null);
  const [sharing, setSharing] = useState<LocalPlaylist | null>(null);
  const [session, setSession] = useState<{ title: string; questions: QuestionData[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    QuestionsService.loadAllQuestions().then(setBank).catch(() => setBank({}));
  }, []);

  const refreshMine = () => setMine(Presets.list());

  const setTab = (next: Tab) =>
    setParams(
      (prev) => {
        if (next === 'public') prev.set('tab', 'public');
        else prev.delete('tab');
        return prev;
      },
      { replace: true }
    );

  const loadPublic = useCallback(() => {
    setPublicError(null);
    PlaylistApi.listPublic()
      .then(setPublicList)
      .catch((err) => setPublicError(errorText(err)));
  }, []);

  useEffect(() => {
    if (tab === 'public' && publicList === null) loadPublic();
  }, [tab, publicList, loadPublic]);

  // ?code=K7Q2MX (the link the share sheet copies) opens that playlist
  const linkCode = params.get('code');
  useEffect(() => {
    if (!linkCode) return;
    setParams(
      (prev) => {
        prev.delete('code');
        return prev;
      },
      { replace: true }
    );
    if (!isPlaylistCode(linkCode)) return;
    PlaylistApi.byCode(linkCode)
      .then(setOpened)
      .catch((err) => setNotice(errorText(err)));
  }, [linkCode, setParams]);

  const openByCode = async (code: string) => {
    try {
      setOpened(await PlaylistApi.byCode(code));
    } catch (err) {
      setNotice(errorText(err));
    }
  };

  const practice = (title: string, ids: string[]) => {
    if (!bank) return;
    const questions = resolve(ids, bank);
    if (questions.length) setSession({ title, questions });
  };

  const editInBuilder = (name: string, ids: string[]) => navigate('/quiz/custom', { state: { load: { name, ids } } });

  const saveCopy = (p: Playlist) => {
    const name = Presets.freeName(p.title);
    Presets.save(name, p.question_ids);
    refreshMine();
    setOpened(null);
    setNotice(`Saved "${name}" to your playlists. It works offline now.`);
  };

  const remove = (p: LocalPlaylist) => {
    const warn = p.code ? ` Its share code ${p.code} keeps working until you stop sharing it.` : '';
    if (!window.confirm(`Delete "${p.name}" from this device?${warn}`)) return;
    Presets.remove(p.name);
    refreshMine();
  };

  const manage = (p: LocalPlaylist) => (
    <div className="flex items-center">
      <button type="button" onClick={() => editInBuilder(p.name, p.ids)} aria-label={`Edit ${p.name} in the Custom Builder`} title="Edit in Custom Builder" className={iconBtn}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
      </button>
      <button
        type="button"
        onClick={() => setSharing(p)}
        aria-label={p.code ? `Sharing options for ${p.name}` : `Share ${p.name}`}
        title={p.code ? 'Shared: see code' : 'Share'}
        className={`${iconBtn} ${p.code ? 'text-primary' : ''}`}
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">ios_share</span>
      </button>
      <button type="button" onClick={() => remove(p)} aria-label={`Delete ${p.name}`} title="Delete" className={`${iconBtn} hover:!bg-error/10 hover:!text-error`}>
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">delete</span>
      </button>
    </div>
  );

  const featured = useMemo(() => publicList?.filter((p) => p.featured) ?? [], [publicList]);
  const community = useMemo(() => publicList?.filter((p) => !p.featured) ?? [], [publicList]);

  if (session) {
    return (
      <QuizSession
        questions={session.questions}
        sessionType="custom"
        filterKey={customSetKey(session.questions.map((q) => q.id))}
        title={session.title}
        exitLabel="Back to Playlists"
        onExit={() => setSession(null)}
        hideAnswers={hideAnswersInCustomQuiz}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-8 pb-24 sm:px-6 lg:px-8 animate-in fade-in duration-300">
      {opened && (
        <PlaylistDetailSheet
          playlist={opened}
          bank={bank}
          onPractice={() => {
            practice(opened.title, opened.question_ids);
            setOpened(null);
          }}
          onSave={() => saveCopy(opened)}
          onEdit={() => editInBuilder(opened.title, opened.question_ids)}
          onClose={() => setOpened(null)}
        />
      )}
      {sharing && (
        <SharePlaylistSheet
          name={sharing.name}
          questionIds={sharing.ids}
          existingCode={sharing.code}
          onShared={(code) => {
            Presets.setCode(sharing.name, code);
            refreshMine();
          }}
          onClose={() => setSharing(null)}
        />
      )}

      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-xl flex-col gap-1.5">
          <h1 className="font-display-lg text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">Playlists</h1>
          <p className="text-sm leading-relaxed text-on-surface-variant">
            Sets of questions you saved, shared with a code, or picked up from others. Yours stay on this device and work
            offline until you share one.
          </p>
        </div>
        <div className="w-full md:w-72">
          <PlaylistCodeForm onLoaded={setOpened} />
        </div>
      </header>

      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/8 px-4 py-3 text-sm text-on-surface">
          <p className="flex-1">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className="tap -my-2 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
          </button>
        </div>
      )}

      <div role="tablist" aria-label="Playlist lists" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container p-1 sm:max-w-sm">
        {(
          [
            ['mine', `Yours${mine.length ? ` (${mine.length})` : ''}`],
            ['public', 'Public'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`pl-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`pl-panel-${value}`}
            onClick={() => setTab(value)}
            className={`tap min-h-[44px] rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
              tab === value ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <section id="pl-panel-mine" role="tabpanel" aria-labelledby="pl-tab-mine" className="flex flex-col gap-3">
          {mine.length === 0 ? (
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-outline-variant/50 px-5 py-8 sm:items-center sm:text-center">
              <span className="material-symbols-outlined text-3xl text-primary" aria-hidden="true">queue_music</span>
              <div className="flex flex-col gap-1">
                <p className="text-base font-semibold text-on-surface">No playlists yet</p>
                <p className="max-w-md text-sm text-on-surface-variant">
                  Pick questions in the Custom Builder and save them, open a code someone gave you, or save one from Public.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/quiz/custom" className={primaryBtn}>
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">architecture</span>
                  Open Custom Builder
                </Link>
                <button type="button" onClick={() => setTab('public')} className={quietBtn}>
                  Browse public playlists
                </button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-outline-variant/15 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low">
              {mine.map((p) => {
                const questions = bank ? resolve(p.ids, bank) : [];
                const topics = bank ? topTopics(p.ids, bank) : [];
                return (
                  <li key={p.name} className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h2 className="min-w-0 max-w-full truncate text-base font-semibold text-on-surface">{p.name}</h2>
                          {p.code ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">share</span>
                              <span className="font-mono-code tracking-wider">{p.code}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-surface-container-high px-1.5 py-0.5 text-[11px] font-semibold text-on-surface-variant">
                              <span className="material-symbols-outlined text-[13px]" aria-hidden="true">lock</span>
                              Private
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-on-surface-variant tabular-nums">
                          {p.ids.length} questions · ~{minutes(p.ids.length)} min
                          {topics.length > 0 && <span className="hidden md:inline"> · {topics.join(', ')}</span>}
                        </p>
                      </div>
                      {/* Phones and tablets: manage actions beside the title, play actions full width below */}
                      <div className="-mr-2 -mt-2 lg:hidden">{manage(p)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center">
                      <button type="button" onClick={() => practice(p.name, p.ids)} disabled={!questions.length} className={primaryBtn}>
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
                        Practice
                      </button>
                      <ExamLaunchButton
                        questions={questions}
                        setKey={customSetKey(p.ids)}
                        title={p.name}
                        sessionType="custom"
                        filterKey={customSetKey(p.ids)}
                        label="Timed exam"
                        className="whitespace-nowrap !rounded-xl"
                      />
                      <div className="hidden lg:block">{manage(p)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {mine.length > 0 && (
            <p className="text-xs text-on-surface-variant">
              New playlists start in the{' '}
              <Link to="/quiz/custom" className="font-semibold text-primary underline-offset-2 hover:underline">
                Custom Builder
              </Link>
              : select questions, then Save playlist.
            </p>
          )}
        </section>
      ) : (
        <section id="pl-panel-public" role="tabpanel" aria-labelledby="pl-tab-public" className="flex flex-col gap-8">
          {publicError || (isOffline && publicList === null) ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-6">
              <p className="text-sm text-on-surface">{isOffline ? "You're offline. Public playlists need a connection." : publicError}</p>
              <p className="text-sm text-on-surface-variant">Your own playlists still work offline.</p>
              <button type="button" onClick={loadPublic} className={quietBtn}>Try again</button>
            </div>
          ) : publicList === null ? (
            <p className="py-12 text-center font-mono-code text-sm text-on-surface-variant" role="status">Loading playlists…</p>
          ) : publicList.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-outline-variant/50 px-5 py-10 text-center text-sm text-on-surface-variant">
              No public playlists yet. Share one of yours as Public to be the first.
            </p>
          ) : (
            <>
              {featured.length > 0 && (
                <PublicGroup title="Picked by SLACKR" items={featured} onOpen={openByCode} />
              )}
              {community.length > 0 && <PublicGroup title="From the community" items={community} onOpen={openByCode} />}
            </>
          )}
        </section>
      )}
    </div>
  );
};

/* ── Public list ──────────────────────────────────────────────────────────── */

const PublicGroup: React.FC<{ title: string; items: PlaylistSummary[]; onOpen: (code: string) => Promise<void> }> = ({
  title,
  items,
  onOpen,
}) => {
  const [opening, setOpening] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-on-surface">{title}</h2>
      <ul className="divide-y divide-outline-variant/15 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low">
        {items.map((p) => (
          <li key={p.code}>
            <button
              type="button"
              disabled={opening !== null}
              onClick={async () => {
                setOpening(p.code);
                await onOpen(p.code);
                setOpening(null);
              }}
              className="group flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-container sm:px-5 cursor-pointer disabled:cursor-wait"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-on-surface">{p.title}</p>
                {p.description && <p className="mt-0.5 line-clamp-2 text-sm text-on-surface-variant">{p.description}</p>}
                <p className="mt-1 text-xs text-on-surface-variant tabular-nums">
                  {p.question_count} questions · ~{minutes(p.question_count)} min
                  {p.owner_name ? ` · by ${p.owner_name}` : ''}
                </p>
              </div>
              <span className="material-symbols-outlined shrink-0 text-[22px] text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-on-surface" aria-hidden="true">
                {opening === p.code ? 'progress_activity' : 'chevron_right'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ── One shared playlist (from a code or the public list) ─────────────────── */

const PlaylistDetailSheet: React.FC<{
  playlist: Playlist;
  bank: QuestionMap | null;
  onPractice: () => void;
  onSave: () => void;
  onEdit: () => void;
  onClose: () => void;
}> = ({ playlist: p, bank, onPractice, onSave, onEdit, onClose }) => {
  const questions = bank ? resolve(p.question_ids, bank) : [];
  const skipped = bank ? p.question_ids.length - questions.length : 0;
  const topics = bank ? topTopics(p.question_ids, bank) : [];
  const years = [...new Set(questions.map((q) => q.year))].sort().reverse();

  return (
    <Sheet
      title={p.title}
      subtitle={`${p.code} · ${p.question_ids.length} questions${p.owner_name ? ` · by ${p.owner_name}` : ''}`}
      icon="queue_music"
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-autofocus onClick={onPractice} disabled={!questions.length} className={primaryBtn}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
              Practice
            </button>
            <ExamLaunchButton
              questions={questions}
              setKey={customSetKey(p.question_ids)}
              title={p.title}
              sessionType="custom"
              filterKey={customSetKey(p.question_ids)}
              label="Timed exam"
              className="whitespace-nowrap !rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onSave} className={quietBtn}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">bookmark_add</span>
              Save to yours
            </button>
            <button type="button" onClick={onEdit} className={quietBtn}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
              Edit a copy
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {p.description && <p className="text-sm leading-relaxed text-on-surface">{p.description}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-on-surface-variant">Length</dt>
            <dd className="font-semibold text-on-surface tabular-nums">
              {questions.length} questions · ~{minutes(questions.length)} min
            </dd>
          </div>
          {years.length > 0 && (
            <div>
              <dt className="text-xs text-on-surface-variant">Exam years</dt>
              <dd className="font-semibold text-on-surface tabular-nums">
                {years.length === 1 ? years[0] : `${years[years.length - 1]}–${years[0]}`}
              </dd>
            </div>
          )}
          {topics.length > 0 && (
            <div className="col-span-2">
              <dt className="text-xs text-on-surface-variant">Mostly</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {topics.map((t) => (
                  <span key={t} className="rounded bg-surface-container-high px-2 py-0.5 text-xs text-tertiary">
                    {t}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
        {skipped > 0 && (
          <p className="text-xs text-confidence-amber">
            {skipped} question{skipped === 1 ? ' is' : 's are'} not in this version of the question bank and will be skipped.
          </p>
        )}
        <p className="text-xs text-on-surface-variant">Save it to keep a private copy that works offline.</p>
      </div>
    </Sheet>
  );
};

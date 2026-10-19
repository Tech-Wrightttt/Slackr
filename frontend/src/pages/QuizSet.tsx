import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QuizSession } from '../components/QuizSession';
import { ExamLaunchButton } from '../components/ExamLaunchButton';
import type { QuestionData } from '../db/schema';
import { QuestionsService } from '../services/questionsService';
import { buildMockPaper, MOCK_PAPER_MINUTES } from '../services/scoring';
import { SET_INFO, type QuestionSetKind } from '../data/questionSets';
import { useStore } from '../store/useStore';

const shuffled = <T,>(list: T[]) => {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

/** Picks one session from a ready-made set: the session length from Settings, a full paper for the mock */
async function pickSession(kind: QuestionSetKind, length: number): Promise<QuestionData[]> {
  if (kind === 'mock') return buildMockPaper(Object.values(await QuestionsService.loadAllQuestions()));
  if (kind === 'frequent') {
    // Most repeated first; ties shuffled so each session brings different repeats
    const all = await QuestionsService.getFrequentlyTested(2);
    const byCount = new Map<number, QuestionData[]>();
    for (const q of all) {
      const c = q.repeat_count ?? 1;
      byCount.set(c, [...(byCount.get(c) ?? []), q]);
    }
    return [...byCount.keys()].sort((a, b) => b - a).flatMap((c) => shuffled(byCount.get(c)!)).slice(0, length);
  }
  return QuestionsService.sortQuestionsStrict(shuffled(await QuestionsService.getByKind(kind)).slice(0, length));
}

/** A ready-made set: practice starts right away; the mock paper offers practice or a timed exam */
export const QuizSet: React.FC = () => {
  const { kind = 'frequent' } = useParams();
  const navigate = useNavigate();
  const sessionLength = useStore((s) => s.sessionLength);
  const [questions, setQuestions] = useState<QuestionData[] | null>(null);
  const [practicing, setPracticing] = useState(kind !== 'mock');
  const info = SET_INFO[kind as QuestionSetKind];

  useEffect(() => {
    if (!info) return;
    pickSession(kind as QuestionSetKind, sessionLength).then(setQuestions);
  }, [kind, info, sessionLength]);

  if (!info) {
    return (
      <div className="py-24 text-center text-sm text-on-surface-variant">
        Unknown set. <Link to="/" className="text-primary underline">Back to the dashboard</Link>
      </div>
    );
  }
  if (!questions) return <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant">Building the set…</div>;

  if (practicing) {
    return (
      <QuizSession
        questions={questions}
        sessionType="set"
        filterKey={`set:${kind}`}
        title={info.title}
        exitLabel="Back to the dashboard"
        onExit={() => navigate('/')}
        withMockScore={kind === 'mock'}
      />
    );
  }

  // Mock paper: a fresh paper each visit, so each one is its own exam set
  const paperId = questions.map((q) => q.id).join(',');
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 flex flex-col gap-6">
      <div>
        <h1 className="font-headline-md text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">{info.title}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{info.blurb}. Scored with the estimated 1000-point mock score.</p>
      </div>
      <div className="flex flex-wrap gap-2.5">
        <ExamLaunchButton
          questions={questions}
          setKey={`mock:${paperId}`}
          title={`Mock paper (${new Date().toLocaleDateString()})`}
          sessionType="set"
          filterKey="set:mock"
          minutes={MOCK_PAPER_MINUTES}
        />
        <button
          type="button"
          onClick={() => setPracticing(true)}
          className="press-scale min-h-[44px] flex items-center gap-2 rounded-xl bg-primary px-5 text-sm font-body-bold text-on-primary hover:bg-primary-fixed-dim cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">play_arrow</span>
          Practice it
        </button>
        <button
          type="button"
          onClick={() => {
            setQuestions(null);
            pickSession('mock', sessionLength).then(setQuestions);
          }}
          className="press-scale min-h-[44px] rounded-xl px-4 text-sm font-semibold text-on-surface-variant hover:text-on-surface cursor-pointer"
        >
          New paper
        </button>
      </div>
    </div>
  );
};

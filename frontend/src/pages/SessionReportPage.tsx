import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SessionReport } from '../components/SessionReport';
import { QuizSession } from '../components/QuizSession';
import type { QuestionData, SessionRecord } from '../db/schema';
import { StatsDbService } from '../services/statsDb';
import { QuestionsService } from '../services/questionsService';
import { buildSessionReport, type SessionReportData } from '../services/sessionReport';

/** A saved after-session report, reopened from the session history */
export const SessionReportPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; session: SessionRecord; questions: QuestionData[]; previous: SessionRecord | null }
  >({ kind: 'loading' });
  const [review, setReview] = useState<QuestionData[] | null>(null);

  useEffect(() => {
    (async () => {
      const session = await StatsDbService.getSession(Number(id));
      if (!session?.log) return setState({ kind: 'missing' });
      const [questions, previous] = await Promise.all([
        QuestionsService.getQuestionsInOrder(session.questionIds ?? session.log.map((l) => l.questionId)),
        StatsDbService.getPreviousSession(session),
      ]);
      setState({ kind: 'ready', session, questions, previous });
    })();
  }, [id]);

  const byId = useMemo(
    () => (state.kind === 'ready' ? Object.fromEntries(state.questions.map((q) => [q.id, q])) : {}),
    [state]
  );
  const report: SessionReportData | null = useMemo(
    () =>
      state.kind === 'ready'
        ? buildSessionReport(state.session.log!, byId, {
            withMockScore: state.session.mode === 'exam' || state.session.sessionType === 'year',
            previous: state.previous?.log,
          })
        : null,
    [state, byId]
  );

  if (state.kind === 'loading') {
    return <div className="py-24 text-center font-mono-code text-sm text-on-surface-variant">Loading report…</div>;
  }
  if (state.kind === 'missing' || !report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center flex flex-col items-center gap-4">
        <h1 className="font-headline-md text-2xl font-bold text-on-surface">Report not found</h1>
        <p className="text-sm text-on-surface-variant">Sessions saved before v1.2 have no per-question log, so they have no report.</p>
        <Link to="/analytics" className="press-scale min-h-[44px] inline-flex items-center rounded-xl bg-primary px-5 text-sm font-body-bold text-on-primary">
          Back to Analytics
        </Link>
      </div>
    );
  }

  const { session } = state;
  if (review) {
    return (
      <QuizSession
        questions={review}
        sessionType={session.sessionType}
        filterKey={`${session.filterKey}#review`}
        title={`Review: ${session.title ?? 'session'}`}
        exitLabel="Back to the report"
        onExit={() => setReview(null)}
      />
    );
  }

  return (
    <SessionReport
      report={report}
      questions={byId}
      order={session.questionIds ?? session.log!.map((l) => l.questionId)}
      title={session.title ?? 'Session report'}
      mode={session.mode ?? 'practice'}
      pauseCount={session.pauseCount}
      completedAt={session.completedAt}
      onReviewMistakes={(ids) => setReview(ids.map((qid) => byId[qid]).filter((q): q is QuestionData => !!q))}
      onExit={() => navigate(-1)}
    />
  );
};

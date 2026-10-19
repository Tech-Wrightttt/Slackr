import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { topicLabel } from '../services/topicColors';
import {
  EXAM_DATES,
  FE_FEE,
  ITPEC_SITE,
  PHILNITS_FAQ,
  PHILNITS_URL,
  daysLeftLabel,
  formatExamDate,
  nextExam,
} from '../data/philnits';

const SUBJECTS = [
  {
    name: 'Subject A',
    when: 'Morning',
    questions: '60 questions',
    time: '90 minutes',
    covers: 'Technology, management and strategy: hardware, networks, databases, security, project management, business and law.',
    practice: { to: '/quiz/year', label: 'Practice Subject A papers' },
  },
  {
    name: 'Subject B',
    when: 'Afternoon',
    questions: '20 questions',
    time: '100 minutes',
    covers: 'Problem solving: reading pseudocode, tracing algorithms and data structures, and information security cases.',
    practice: { to: '/quiz/set/solving', label: 'Practice solving questions' },
  },
];

const LEVELS = [
  { name: 'IP', title: 'IT Passport', level: 'Level 1', detail: '100 questions in 120 minutes, half a day. IT basics for any job.' },
  { name: 'FE', title: 'Fundamental IT Engineers', level: 'Level 2', detail: 'Two subjects in one day, with a lunch break between them.', ours: true },
  { name: 'AP', title: 'Applied IT Engineers', level: 'Level 3', detail: 'For experienced engineers. Given only in Japan, in Japanese.' },
];

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="flex flex-col gap-4 scroll-mt-24">
    <h2 id={id} className="font-display-lg text-xl sm:text-2xl font-bold tracking-tight text-on-surface text-balance">
      {title}
    </h2>
    {children}
  </section>
);

const ExternalLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-semibold text-primary underline underline-offset-[3px] decoration-primary/40 hover:decoration-primary"
  >
    {children}
  </a>
);

export const AboutPhilnits: React.FC = () => {
  const [topics, setTopics] = useState<[string, number][]>([]);
  const [total, setTotal] = useState(0);
  const next = nextExam();

  useEffect(() => {
    document.title = 'About PhilNITS · SLACKR';
    QuestionsService.loadMetadataSummary()
      .then((meta: any) => {
        const counts = (meta?.topic_counts ?? {}) as Record<string, number>;
        setTopics(Object.entries(counts).sort((a, b) => b[1] - a[1]));
        setTotal(meta?.total_questions ?? 0);
      })
      .catch(() => setTopics([]));
    return () => {
      document.title = 'SLACKR';
    };
  }, []);

  const top = topics[0]?.[1] ?? 1;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex flex-col gap-12 enter-rise">
      <header className="flex flex-col gap-4">
        <h1 className="font-display-lg text-3xl sm:text-4xl font-bold tracking-tight text-on-surface text-balance">
          About PhilNITS and the FE exam
        </h1>
        <p className="text-base leading-relaxed text-on-surface-variant max-w-[64ch]">
          PhilNITS is the foundation that runs the ITPEC IT certification exams in the Philippines. ITPEC is a group of six
          Asian countries that give a common exam, made with Japan&rsquo;s IPA. SLACKR prepares you for its Level 2 exam,
          the Fundamental IT Engineers (FE) exam. In the Philippines it is given in English.
        </p>

        {/* Next exam: the one fact people come here for most often */}
        <div className="mt-2 rounded-2xl border border-tertiary/30 bg-tertiary/8 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <span className="w-12 h-12 shrink-0 rounded-xl bg-tertiary/15 text-tertiary flex items-center justify-center" aria-hidden="true">
            <span className="material-symbols-outlined text-[26px]">event</span>
          </span>
          {next ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-on-surface-variant">Next exam day</p>
              <p className="text-lg sm:text-xl font-bold text-on-surface">
                <time dateTime={next.iso}>{formatExamDate(next.date)}</time>
              </p>
              <p className="font-mono-code text-sm font-semibold text-tertiary">{daysLeftLabel(next.daysLeft)}</p>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold text-on-surface">Exams are held every April and October</p>
              <p className="text-sm text-on-surface-variant">Check philnits.org for the next date.</p>
            </div>
          )}
          <a
            href={PHILNITS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press-scale shrink-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-tertiary px-4 text-sm font-semibold text-on-tertiary hover:opacity-90"
          >
            Register on philnits.org
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_new</span>
          </a>
        </div>
      </header>

      <Section id="format" title="Two subjects, one day">
        <div className="grid gap-4 sm:grid-cols-2">
          {SUBJECTS.map((s) => (
            <article key={s.name} className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-5 flex flex-col gap-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-bold text-on-surface">{s.name}</h3>
                <span className="text-sm text-on-surface-variant">{s.when}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-surface-container px-3 py-2.5">
                  <dt className="text-xs text-on-surface-variant">Questions</dt>
                  <dd className="font-mono-code text-base font-bold text-on-surface">{s.questions.split(' ')[0]}</dd>
                </div>
                <div className="rounded-xl bg-surface-container px-3 py-2.5">
                  <dt className="text-xs text-on-surface-variant">Time</dt>
                  <dd className="font-mono-code text-base font-bold text-on-surface">{s.time}</dd>
                </div>
              </dl>
              <p className="text-sm leading-relaxed text-on-surface-variant">{s.covers}</p>
              <Link
                to={s.practice.to}
                className="press-scale mt-auto self-start min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-1 text-sm font-semibold text-primary hover:underline underline-offset-[3px]"
              >
                {s.practice.label}
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
              </Link>
            </article>
          ))}
        </div>
        <p className="text-sm leading-relaxed text-on-surface-variant max-w-[64ch]">
          Every question in both subjects is multiple choice. Older papers used a Morning (AM) and Afternoon (PM) format with
          longer sittings. SLACKR keeps those papers too, because their questions still come back.
        </p>
      </Section>

      <Section id="passing" title="Passing and retakes">
        <ul className="flex flex-col gap-3 max-w-[64ch]">
          {[
            ['check_circle', 'Pass both subjects, with at least 60% in each, to earn the FE certificate.'],
            ['replay', 'Passed only one? You have one year from the exam date to retake the subject you failed.'],
            ['groups', 'Anyone can take it: no age limit, degree or work experience is required.'],
            ['payments', `The FE exam costs ${FE_FEE}, as listed by PhilNITS.`],
          ].map(([icon, text]) => (
            <li key={icon} className="flex items-start gap-3 text-sm sm:text-base leading-relaxed text-on-surface">
              <span className="material-symbols-outlined text-[20px] text-primary mt-0.5" aria-hidden="true">{icon}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="schedule" title="When it is held">
        <p className="text-sm sm:text-base leading-relaxed text-on-surface-variant max-w-[64ch]">
          Twice a year, on a Sunday in April and in October. Dates listed on philnits.org:
        </p>
        <ol className="flex flex-wrap gap-2">
          {EXAM_DATES.map((iso) => {
            const [y, m, d] = iso.split('-').map(Number);
            const date = new Date(y!, m! - 1, d!);
            const isNext = next?.iso === iso;
            return (
              <li
                key={iso}
                className={`rounded-xl border px-3.5 py-2 font-mono-code text-sm ${
                  isNext ? 'border-tertiary/40 bg-tertiary/10 font-semibold text-tertiary' : 'border-outline-variant/30 text-on-surface-variant'
                }`}
              >
                <time dateTime={iso}>{date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                {isNext && <span className="sr-only"> (next)</span>}
              </li>
            );
          })}
        </ol>
      </Section>

      <Section id="levels" title="Where FE sits">
        <ol className="flex flex-col gap-2">
          {LEVELS.map((l) => (
            <li
              key={l.name}
              className={`rounded-2xl border p-4 flex items-start gap-4 ${
                l.ours ? 'border-primary/35 bg-primary/8' : 'border-outline-variant/30 bg-surface-container-low'
              }`}
            >
              <span
                className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center font-mono-code text-sm font-bold ${
                  l.ours ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'
                }`}
              >
                {l.name}
              </span>
              <div className="min-w-0 flex flex-col gap-0.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold text-on-surface">
                  {l.title}
                  <span className="text-xs font-medium text-on-surface-variant">{l.level}</span>
                  {l.ours && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">What SLACKR covers</span>
                  )}
                </p>
                <p className="text-sm leading-relaxed text-on-surface-variant">{l.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="syllabus" title="What the questions cover">
        <p className="text-sm sm:text-base leading-relaxed text-on-surface-variant max-w-[64ch]">
          {total > 0
            ? `The ${total.toLocaleString()} past questions in SLACKR, by topic. Pick one to practice it.`
            : 'Past questions by topic. Pick one to practice it.'}
        </p>
        {topics.length > 0 && (
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {topics.map(([topic, count]) => (
              <li key={topic}>
                <Link
                  to={`/quiz/topic?topic=${encodeURIComponent(topic)}`}
                  className="group min-h-[44px] flex items-center gap-3 rounded-lg px-2 -mx-2 hover:bg-surface-container"
                >
                  <span className="flex-1 min-w-0 flex flex-col gap-1 py-1.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-on-surface group-hover:text-primary">{topicLabel(topic)}</span>
                      <span className="font-mono-code text-xs tabular-nums text-on-surface-variant">{count}</span>
                    </span>
                    <span className="h-1 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.max(3, (count / top) * 100)}%` }} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="links" title="Official sources">
        <p className="text-sm sm:text-base leading-relaxed text-on-surface-variant max-w-[64ch]">
          Fees, dates and rules can change. Always confirm on the <ExternalLink href={PHILNITS_URL}>PhilNITS website</ExternalLink>, its{' '}
          <ExternalLink href={PHILNITS_FAQ}>FAQ</ExternalLink>, or the <ExternalLink href={ITPEC_SITE}>ITPEC website</ExternalLink>. SLACKR
          is an independent reviewer and is not affiliated with PhilNITS.
        </p>
      </Section>
    </div>
  );
};

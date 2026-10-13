import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_DOCS, PHILNITS_URL, type LegalDoc } from '../data/legal';

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

const LegalPage: React.FC<{ doc: LegalDoc }> = ({ doc }) => {
  const other = doc.slug === 'terms' ? LEGAL_DOCS.privacy : LEGAL_DOCS.terms;

  useEffect(() => {
    document.title = `${doc.title} · SLACKR`;
    return () => {
      document.title = 'SLACKR';
    };
  }, [doc.title]);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 enter-rise">
      <Link
        to="/profile"
        className="press-scale inline-flex items-center gap-1 min-h-[36px] -ml-1 px-1 rounded-lg text-xs font-semibold text-on-surface-variant hover:text-primary"
      >
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>
        Profile
      </Link>

      <header className="mt-4 pb-6 border-b border-outline-variant/25 flex flex-col gap-2">
        <h1 className="font-display-lg text-3xl sm:text-4xl font-bold tracking-tight text-on-surface text-balance">
          {doc.title}
        </h1>
        <p className="text-sm sm:text-base text-on-surface-variant max-w-[62ch]">{doc.summary}</p>
        <p className="font-mono-code text-xs text-on-surface-variant">
          Last updated <time dateTime={doc.updated}>{formatDate(doc.updated)}</time>
        </p>
      </header>

      <a
        href={PHILNITS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="press-scale mt-6 flex items-start gap-3 rounded-xl bg-primary/8 px-4 py-3 text-xs text-on-surface max-w-[68ch] hover:bg-primary/12"
      >
        <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">school</span>
        <span>
          SLACKR is free and non-profit. Every exam question in it comes from PhilNITS, which is not affiliated with this app.{' '}
          <span className="font-semibold text-primary underline underline-offset-2">Official PhilNITS site</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </span>
      </a>

      <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-24 flex flex-col gap-0.5 text-sm">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="block rounded-lg px-2.5 py-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                >
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="flex flex-col gap-8 max-w-[68ch] text-[15px] leading-relaxed text-on-surface-variant">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 flex flex-col gap-3">
              <h2 className="font-title-sm text-lg font-bold text-on-surface">{s.heading}</h2>
              {s.paragraphs?.map((p, i) => <p key={i}>{p}</p>)}
              {s.bullets && (
                <ul className="flex flex-col gap-2 pl-1">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.note && <p>{s.note}</p>}
              {s.link && (
                <a
                  href={s.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start inline-flex items-center gap-1.5 font-semibold text-primary underline underline-offset-4 hover:no-underline"
                >
                  {s.link.label}
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span>
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </section>
          ))}

          <Link
            to={`/legal/${other.slug}`}
            className="press-scale mt-2 flex items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-container-low px-5 py-4 hover:border-primary/40"
          >
            <span>
              <span className="block text-xs text-on-surface-variant">Also read</span>
              <span className="block font-semibold text-on-surface">{other.title}</span>
            </span>
            <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">arrow_forward</span>
          </Link>
        </article>
      </div>
    </div>
  );
};

export const Terms: React.FC = () => <LegalPage doc={LEGAL_DOCS.terms} />;
export const Privacy: React.FC = () => <LegalPage doc={LEGAL_DOCS.privacy} />;

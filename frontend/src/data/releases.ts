/**
 * Release notes shown on the News page, newest first.
 * When you ship a version: bump `version` in package.json, then add an entry at the top here (with 2-4 highlights).
 * `area` is optional: changes that share one are grouped under it on the page.
 */
export interface Release {
  version: string; // e.g. '1.1.0'
  date: string; // YYYY-MM-DD
  title: string;
  summary?: string;
  highlights?: string[]; // 2-4 headline features shown before "See all changes"
  changes: { type: 'new' | 'improved' | 'fixed'; text: string; area?: string }[];
}

/**
 * Changes already live in the app but not yet bundled into a numbered version.
 * When you cut the next release, move these into a new RELEASES entry and empty this list.
 */
export const UNRELEASED: Omit<Release, 'version'> | null = null;

export const RELEASES: Release[] = [
  {
    version: '1.1.0',
    date: '2026-10-14',
    title: 'Clearer analytics, honest numbers and better reviews',
    summary: 'See exactly how every stat is worked out, rate your confidence on every answer, and read explanations that follow the real solution.',
    highlights: [
      'Info icons on every Analytics metric explain what it means and the exact formula.',
      '“How sure are you?” starts blank and reminds you before the answer is revealed.',
      'Step Breakdown follows the question’s own solution instead of a generic template.',
      'Correct exam times: Subject A 90 minutes, Subject B 100 minutes.',
    ],
    changes: [
      { area: 'Progress & analytics', type: 'new', text: 'Every Analytics metric has an info icon. Hover, tap or press Enter to see what it means and the exact formula behind it. On phones it opens as a bottom sheet.' },
      { area: 'Progress & analytics', type: 'fixed', text: 'New profiles no longer see sample numbers. Until you answer questions, Analytics shows empty states and dashes instead of placeholder scores.' },
      { area: 'Progress & analytics', type: 'improved', text: 'Empty heatmap, calibration and ledger tables collapse into one short note until there is data, so the page is much shorter on day one.' },
      { area: 'Progress & analytics', type: 'improved', text: 'Chart colors follow the light and dark theme.' },

      { area: 'Practice', type: 'new', text: '“How sure are you?” starts unselected on every question. Pressing Submit without a rating shows a reminder before the answer is revealed, with a “Submit without rating” option.' },
      { area: 'Practice', type: 'new', text: 'New setting in Profile → Session Preferences: Require Confidence Before Submitting. On by default.' },
      { area: 'Practice', type: 'improved', text: 'Answer choices work with the keyboard and screen readers: Tab to the choices, arrow keys to move, Space to pick. The result is announced after you submit.' },
      { area: 'Practice', type: 'improved', text: 'A wrong pick is now marked “Your answer” with an icon, not just red, and the right one is labelled “Correct answer”.' },
      { area: 'Practice', type: 'fixed', text: 'Pressing Enter to submit now saves the confidence level you picked last.' },
      { area: 'Practice', type: 'improved', text: 'The pace indicator reads On pace, Slowing or Over time and changes color with it.' },

      { area: 'Explanations', type: 'fixed', text: 'Step Breakdown now builds its steps from the question’s own explanation instead of a generic template, and ends with the official answer.' },
      { area: 'Explanations', type: 'improved', text: 'Explanations have proper spacing for paragraphs, lists and math, and the breakdown header no longer squeezes onto several lines.' },

      { area: 'Year Papers', type: 'fixed', text: 'Exam times are correct: Subject A 90 minutes, Subject B 100 minutes. Older Morning and Afternoon papers stay at 150 minutes.' },
      { area: 'Year Papers', type: 'fixed', text: 'Year Accuracy shows your real accuracy for the selected year instead of a fixed number.' },
      { area: 'Year Papers', type: 'improved', text: 'The individual papers come first and the full-year mock exam sits below them.' },

      { area: 'Dashboard', type: 'improved', text: 'On a new profile, empty weak spots, activity and attempts are replaced by one card pointing to the Daily Set.' },
      { area: 'Dashboard', type: 'improved', text: 'Syllabus Scope shows the current FE format: Subject A 60 questions in 90 minutes, Subject B 20 questions in 100 minutes.' },

      { area: 'Look & feel', type: 'improved', text: 'Clearer labels across the app, for example “Online · Saved locally” and “Reset all progress”.' },
      { area: 'Look & feel', type: 'fixed', text: 'Tiny 8–9px labels are larger, missing keyboard focus rings are back, and pulsing animations respect reduced motion.' },
      { area: 'Look & feel', type: 'improved', text: 'Status colors are now tuned per theme, so amber, sky and emerald text stays readable on Warm Paper.' },
      { area: 'Look & feel', type: 'improved', text: 'The koala mascot joins the dashboard and loading screens, and dashboard tiles and settings sections carry their own color.' },
      { area: 'Look & feel', type: 'improved', text: 'The study streak now shows as a eucalyptus leaf with a plain day count.' },
      { area: 'Look & feel', type: 'fixed', text: 'Dashboard buttons, the streak strip, settings rows and the footer no longer wrap awkwardly on phones.' },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-13',
    title: 'SLACKR 1.0: the complete offline PhilNITS reviewer',
    summary:
      'The first full release. Every past FE question, three ways to schedule reviews, deep analytics and optional cloud backup, all working without a connection.',
    highlights: [
      'All 3,609 PhilNITS FE questions from 2007 to 2026, fully offline.',
      'Spaced repetition with SM-2, FSRS or SLACKR Custom, plus a fresh Daily Set every day.',
      'Analytics: weakness heatmap, FE-A / FE-B matrix and confidence calibration.',
      'Optional online accounts with cloud backup on any device.',
    ],
    changes: [
      { area: 'Practice', type: 'new', text: 'All 3,609 PhilNITS FE questions from 2007 to 2026, sorted the way the exam is: year, Spring before Autumn, FE-A before FE-B, then question number.' },
      { area: 'Practice', type: 'new', text: 'Six ways to study: Year Papers, Topics, Combined filters, the Custom Builder with saved sets, the SRS Queue and a fresh Daily Set every day.' },
      { area: 'Practice', type: 'new', text: 'Rate your confidence before the answer is revealed, then read the explanation. Keyboard shortcuts cover answering, submitting and moving on.' },
      { area: 'Practice', type: 'new', text: 'Full-screen draw overlay for scratch work right on top of the question. Press Esc to exit.' },
      { area: 'Practice', type: 'new', text: 'Bookmark questions or defer them for later, with both highlighted in the Question Grid.' },
      { area: 'Practice', type: 'new', text: 'KaTeX math and diagrams you can pinch-zoom on touch screens or zoom with the keyboard.' },

      { area: 'Spaced repetition', type: 'new', text: 'Choose SuperMemo SM-2, FSRS or SLACKR Custom. Switching replays your history under the new algorithm.' },
      { area: 'Spaced repetition', type: 'new', text: 'Due reviews show as a badge in the top bar, and the Daily Set resumes where you left off.' },

      { area: 'Progress & analytics', type: 'new', text: 'Weakness heatmap across all 29 topic categories by day, week or month.' },
      { area: 'Progress & analytics', type: 'new', text: 'FE-A / FE-B analytics matrix, confidence calibration chart and per-question history.' },
      { area: 'Progress & analytics', type: 'new', text: 'Activity calendar with streaks, and Priority Weak Spots on the dashboard.' },

      { area: 'Offline & data', type: 'new', text: 'Install SLACKR as an app and download the full question bank, every diagram and the fonts for 100% offline use.' },
      { area: 'Offline & data', type: 'new', text: 'Export and import everything as JSON, merging or overwriting, and import your progress from PelNETS.' },

      { area: 'Accounts', type: 'new', text: 'Optional online accounts: back up your progress to the cloud and sign in on any device. Guest mode stays fully featured.' },
      { area: 'Accounts', type: 'new', text: 'Keep several accounts on one device, reset a forgotten password, and get guided toward a strong one.' },

      { area: 'Help & feedback', type: 'new', text: 'Report a wrong answer, a confusing explanation or an app bug. Reports queue offline and send when you reconnect.' },
      { area: 'Help & feedback', type: 'new', text: 'Terms of Service and Privacy Policy under Profile, with full credit to PhilNITS and a link to the official site.' },

      { area: 'Help & feedback', type: 'new', text: 'A friendly 404 page for broken links, and a recovery screen if something crashes or the app fails to load.' },
    ],
  },
];

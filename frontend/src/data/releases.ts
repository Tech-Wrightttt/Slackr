/**
 * Release notes shown on the News page, newest first.
 * When you ship a version: bump `version` in package.json, then add an entry at the top here.
 * `area` is optional: changes that share one are grouped under it on the page.
 */
export interface Release {
  version: string; // e.g. '1.1.0'
  date: string; // YYYY-MM-DD
  title: string;
  summary?: string;
  changes: { type: 'new' | 'improved' | 'fixed'; text: string; area?: string }[];
}

export const RELEASES: Release[] = [
  {
    version: '1.0.0',
    date: '2026-10-14',
    title: 'SLACKR 1.0: the complete offline PhilNITS reviewer',
    summary:
      'The first full release. Every past FE question, three ways to schedule reviews, deep analytics and optional cloud backup, all working without a connection.',
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

      { area: 'Look & feel', type: 'improved', text: 'Status colors are now tuned per theme, so amber, sky and emerald text stays readable on Warm Paper.' },
      { area: 'Look & feel', type: 'improved', text: 'The koala mascot joins the dashboard and loading screens, and dashboard tiles and settings sections carry their own color.' },
      { area: 'Look & feel', type: 'improved', text: 'The study streak now shows as a eucalyptus leaf with a plain day count.' },
      { area: 'Help & feedback', type: 'new', text: 'A friendly 404 page for broken links, and a recovery screen if something crashes or the app fails to load.' },
      { area: 'Look & feel', type: 'fixed', text: 'Dashboard buttons, the streak strip, settings rows and the footer no longer wrap awkwardly on phones.' },
    ],
  },
];

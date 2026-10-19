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
    version: '2.0.1',
    date: '2026-10-19',
    title: 'Fixes from your bug reports',
    summary:
      'Every report sent from the app was checked against the official ITPEC question and answer papers. This update fixes the ones 2.0.0 had not covered yet. Thank you for reporting them.',
    highlights: [
      'Lists and formulas in questions keep their own lines instead of running into one paragraph.',
      'Three questions with wrong text, a wrong explanation or an unreadable answer key are corrected.',
      'Stray “Q8.” labels are gone from the start of 217 questions.',
    ],
    changes: [
      { area: 'Questions', type: 'fixed', text: 'Line breaks in questions, choices and explanations now show, so “(i) … (ii) …” lists and expressions on their own line no longer run together.' },
      { area: 'Questions', type: 'fixed', text: 'Paragraphs in a question have space between them again.' },
      { area: 'Questions', type: 'fixed', text: 'Removed the leftover question number (“Q8.”) that started 217 questions, since the card already shows it.' },

      { area: 'Corrected questions', type: 'fixed', text: '2022 April Morning Q1: the question now says A·B is the AND operation, as in the official paper.' },
      { area: 'Corrected questions', type: 'fixed', text: '2024 April Subject A Q27: replaced the explanation, which belonged to a different question, with one on brute force attacks.' },
      { area: 'Corrected questions', type: 'fixed', text: '2024 April Subject A Q35: the answer key was a picture and could not be graded. It is now the official answer, a.' },
    ],
  },
  {
    version: '2.0.0',
    date: '2026-10-19',
    title: 'Timed exams, session reports and exact afternoon choices',
    summary:
      'Take any set as a real timed exam, get a full report after every session, study with ready-made question sets, and answer Subject B and PM questions with exactly the choices printed in the official paper.',
    highlights: [
      'Exam mode: one timed attempt per set, forward-only, no feedback until the end, and it survives a refresh.',
      'A full report after every session: score, estimated mock score out of 1000, slowest questions, switches and mistakes to review.',
      'Exact choice letters for 982 picture-only questions, read from the official exam papers, blank by blank.',
      'New sets: Frequently tested, Recall only, Solving only and a Mock paper.',
    ],
    changes: [
      { area: 'Exam mode', type: 'new', text: '“Take as timed quiz” on year, topic and custom sets. A countdown runs for the whole set, matching the official paper length, and submits on its own at zero.' },
      { area: 'Exam mode', type: 'new', text: 'Real exam rules: move forward only, no changing an answer after you move on, no feedback until the end, and skipped questions count as wrong.' },
      { area: 'Exam mode', type: 'new', text: 'Flag questions during an exam. Pausing hides the question and stops the clock; turn on Strict Exams (No Pausing) in Profile to disable it.' },
      { area: 'Exam mode', type: 'new', text: 'Each set can be taken as an exam once. Opening it again shows your result, and you can reset one set or all of them without losing your stats.' },
      { area: 'Exam mode', type: 'new', text: 'An exam in progress is saved after every answer, so an accidental refresh or closed tab picks up where you left off.' },
      { area: 'Exam mode', type: 'improved', text: 'Exam answers count in Analytics and spaced repetition like any other attempt, and are marked as exam answers.' },

      { area: 'Session reports', type: 'new', text: 'Every practice set and exam ends in a report: accuracy over the whole set, total and average time, and skipped and flagged questions.' },
      { area: 'Session reports', type: 'new', text: 'See your slowest and fastest questions, fast wrong answers marked as rushed, and answers you switched to or away from the right choice.' },
      { area: 'Session reports', type: 'new', text: 'More stats per session: accuracy by topic, high-confidence mistakes, first half against second half, and how you did last time on the same set.' },
      { area: 'Session reports', type: 'new', text: '“Review mistakes” starts a new set with the questions you got wrong or skipped. Past reports reopen from your recent sessions.' },
      { area: 'Session reports', type: 'new', text: 'Estimated mock score out of 1000 next to the 600 pass line. PhilNITS does not publish its weights, so this is an estimate.' },
      { area: 'Session reports', type: 'fixed', text: 'Scores now divide by every question in the set, not only the ones you answered, so skipping hard questions no longer raises your score.' },

      { area: 'Question sets', type: 'new', text: 'Four ready-made sets on the dashboard: Frequently tested, Recall only, Solving only and a Mock paper that matches the real mix of question types.' },
      { area: 'Question sets', type: 'new', text: 'Questions that come back across exam years show “Appeared in N exams”.' },
      { area: 'Question sets', type: 'new', text: 'The Custom Builder can filter by question type (recall or solving) and by frequently tested questions, together with year and topic.' },

      { area: 'Practice', type: 'new', text: 'Come back to a question you already answered in the set and you see your answer and the feedback, without a second attempt being saved.' },
      { area: 'Practice', type: 'new', text: 'Quick toggles in the session header: One attempt (or a Try again button), and Shuffle choices with an order that stays put when you come back.' },
      { area: 'Practice', type: 'new', text: 'Pause or stop the question timer. Pausing hides the question so it cannot be read ahead. A session timer adds up the whole set.' },
      { area: 'Practice', type: 'new', text: 'Switching your pick three or more times before submitting shows a gentle hint to commit to your reasoning first.' },
      { area: 'Practice', type: 'improved', text: 'Restyled answer states in both themes: the correct answer, your wrong pick and the other choices each have their own tint, border and icon.' },

      { area: 'Afternoon & Subject B', type: 'fixed', text: 'Picture-only questions now show exactly the choice letters printed in the official exam paper, so no more missing or extra choices.' },
      { area: 'Afternoon & Subject B', type: 'fixed', text: 'Questions with several blanks give each blank its own choices, for example a–j for blanks A to D and a–g for blank E.' },
      { area: 'Afternoon & Subject B', type: 'fixed', text: 'Multi-blank answers like “A = c, B = e” are graded per blank instead of being impossible to mark right.' },
      { area: 'Afternoon & Subject B', type: 'fixed', text: 'Choices that span several lines, contain bold text or sit on one line are read in full instead of being cut off.' },
      { area: 'Afternoon & Subject B', type: 'improved', text: 'Questions whose answer key is only a picture let you check the answer and grade yourself.' },

      { area: 'Drawing', type: 'new', text: 'Redo with Ctrl+Y or Ctrl+Shift+Z, plus a redo button next to undo.' },
      { area: 'Drawing', type: 'new', text: 'Double-tap with a finger or pen to undo the last stroke.' },
      { area: 'Drawing', type: 'new', text: 'Scribble over strokes to erase them. Undo brings them back, and Scribble to Erase can be turned off in Profile.' },

      { area: 'Progress & analytics', type: 'new', text: 'Open any exam year for its own stats: accuracy and coverage per paper, repeat mistakes, weakest topics, time per question, high-confidence mistakes and your trend.' },

      { area: 'Custom Builder', type: 'improved', text: 'Redesigned with pages of 25, 50 or 100 questions. Every filtered question is reachable, not only the first 100.' },
      { area: 'Custom Builder', type: 'fixed', text: '“Select all” picks every filtered question, “Select page” picks the current page, and your selection stays when you change pages.' },
      { area: 'Custom Builder', type: 'improved', text: 'The old “Show Answers” toggle now says what it does: reveal answers after each question.' },

      { area: 'Offline & data', type: 'improved', text: 'Installed apps download the updated question bank automatically.' },

      { area: 'Phones & tablets', type: 'improved', text: 'On Android phones and tablets, the session header, timer, report, Year stats and Custom Builder controls grow to a full thumb-sized target.' },
      { area: 'Phones & tablets', type: 'fixed', text: 'Year Papers and Profile no longer scroll sideways on narrow phones.' },
      { area: 'Look & feel', type: 'improved', text: 'The News page marks the version you are on with a glow and a sparkle.' },
      { area: 'Look & feel', type: 'improved', text: 'Exam mode uses the slate teal reserved for time and pacing, from the launch button to the report tags.' },

      { area: 'Navigation', type: 'new', text: 'A simpler top bar on computers: Dashboard, Practice, Review, Analytics and PhilNITS. The current page is underlined.' },
      { area: 'Navigation', type: 'new', text: 'Practice opens a short menu with Year Papers, Topics, Combined and Custom Builder, each with a one-line description. It works with the keyboard too.' },
      { area: 'Navigation', type: 'new', text: 'News moved to an icon that shows a dot until you read the latest release notes. Profile and settings sit behind the avatar.' },
      { area: 'Navigation', type: 'improved', text: 'The phone and tablet menu groups the practice modes under one heading and has larger tap targets.' },
      { area: 'Navigation', type: 'improved', text: 'The “Online · Saved locally” badge is gone. An Offline chip appears only when you lose your connection.' },

      { area: 'About PhilNITS', type: 'new', text: 'New About PhilNITS page: what PhilNITS and ITPEC are, the two FE subjects, how to pass and retake, the fee, and where FE sits next to IP and AP.' },
      { area: 'About PhilNITS', type: 'new', text: 'See the next exam day with a countdown, plus the dates listed on philnits.org.' },
      { area: 'About PhilNITS', type: 'new', text: 'Every topic in the question bank with its question count. Tap one to practice it.' },

      { area: 'Dashboard', type: 'improved', text: 'Syllabus Scope is replaced by a Next PhilNITS exam card that links to the About PhilNITS page.' },
      { area: 'Dashboard', type: 'fixed', text: 'The Item Bank shows the real Subject A and Subject B question counts instead of fixed numbers.' },
      { area: 'Look & feel', type: 'improved', text: 'Removed labels that said nothing useful: “FE / AP” next to the logo, the dashboard’s “PhilNITS FE / AP Engine” line, and the Pace chip on questions.' },
    ],
  },
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

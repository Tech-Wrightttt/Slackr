/**
 * How every Analytics metric is calculated, shown in the (i) info tips.
 * Keep these in step with services/analyticsEngine.ts: they describe that code, not an ideal.
 */
export interface MetricDefinition {
  title: string;
  what: string; // one plain sentence: what the number tells you
  formula: string[]; // one line per step, rendered monospace
  notes?: string[];
}

export const METRICS = {
  consistency: {
    title: 'Consistency Index',
    what: 'How steady your accuracy stays from one stretch of questions to the next.',
    formula: [
      'window_i = correct in answers i..i+4 ÷ 5 × 100',
      'σ = standard deviation of every window_i',
      'Consistency = 100 − 2 × σ   (kept between 0 and 100)',
    ],
    notes: ['Uses every answer in time order. Needs at least 5 answers.', 'σ is the spread shown in brackets: lower means steadier.'],
  },
  calibration: {
    title: 'Metacognitive Calibration',
    what: 'Whether your confidence rating matches how often you are actually right.',
    formula: [
      'expected p: 1→0.2  2→0.4  3→0.6  4→0.8  5→1.0',
      'outcome = 1 if correct, 0 if wrong',
      'Brier = average of (p − outcome)²',
      'Overconfident = wrong ÷ answers rated 4–5 × 100',
      'Underconfident = correct ÷ answers rated 1–2 × 100',
    ],
    notes: ['Brier runs from 0 (perfect) to 1. Rating every answer 3 and getting half right gives about 0.25.', 'Only answers with a confidence rating count.'],
  },
  weakSpot: {
    title: 'Priority Weak Spot',
    what: 'The topic that most needs review right now, weighing errors and how recently you saw it.',
    formula: [
      'errorRate = wrong ÷ answered × 100',
      'recency = 1.2 if last answer < 3 days ago, 0.9 if > 14 days, else 1.0',
      'weight = min(1, answered ÷ 5)',
      'priority = (errorRate × 0.7 + wrong × 3 × 0.3) × recency × weight',
    ],
    notes: ['The topic with the highest priority is shown here; the full ranking is under Curriculum Vulnerabilities.'],
  },
  completion: {
    title: 'Overall Completion',
    what: 'How much of the question bank you have answered at least once.',
    formula: ['Completion = unique questions answered ÷ questions in the bank × 100'],
    notes: ['Answering the same question again does not raise completion.'],
  },
  completionAccuracy: {
    title: 'Overall Accuracy',
    what: 'Of the questions you have tried, how many you have got right at least once.',
    formula: ['Accuracy = questions answered correctly at least once ÷ unique questions answered × 100'],
    notes: ['A question you missed first and later got right counts as correct here.'],
  },
  yearProgress: {
    title: 'Progress by Exam Year',
    what: 'Completion and accuracy for each year’s papers.',
    formula: [
      'Completion = questions answered in that year ÷ questions in that year × 100',
      'Acc = answered correctly at least once ÷ answered × 100',
    ],
  },
  topicProgress: {
    title: 'Progress by Topic',
    what: 'Completion and accuracy for each syllabus topic.',
    formula: [
      'Completion = questions answered in topic ÷ questions in topic × 100',
      'Accuracy = answered correctly at least once ÷ answered × 100',
    ],
    notes: ['A question tagged with several topics counts toward each of them.'],
  },
  recentAccuracy: {
    title: 'Current Rolling Accuracy',
    what: 'Your accuracy on the more recent half of your answers for this subject.',
    formula: [
      'Sort this subject’s answers oldest → newest',
      'Split at the middle: earlier half | recent half',
      'Recent accuracy = correct ÷ answers in recent half × 100',
    ],
    notes: ['≥ 60% shows as above the pass mark, 50–59% as approaching.'],
  },
  velocity: {
    title: 'Velocity',
    what: 'How much your accuracy has moved between your earlier and recent answers.',
    formula: ['Velocity = recent-half accuracy − earlier-half accuracy   (percentage points)'],
    notes: ['Positive means you are improving on this subject.'],
  },
  avgTime: {
    title: 'Average Time per Answer',
    what: 'How long you usually take on one question of this subject.',
    formula: ['Avg time = total seconds on timed answers ÷ number of timed answers'],
    notes: ['Imported answers without a time are left out so they do not drag the average to zero.'],
  },
  difficultyGap: {
    title: 'Difficulty Gap',
    what: 'How much harder Subject B is for you than Subject A, in accuracy and time.',
    formula: [
      'gap = Subject A accuracy − Subject B accuracy',
      'Subject B harder by = max(0, gap)',
      'Pace ratio = Subject B avg time ÷ Subject A avg time',
    ],
    notes: ['Accuracy here uses all answers in each subject, not just the recent half.'],
  },
  progressionGraph: {
    title: 'Progression Graph',
    what: 'Your Subject A and Subject B trend, one point per day you studied.',
    formula: [
      'Accuracy = all correct so far ÷ all answered so far × 100   (running total)',
      'Pace = average seconds per answer on that day',
      'Improvement = running accuracy that day − running accuracy on your first day',
    ],
    notes: ['The marked line at 60% is the pass mark.'],
  },
  vulnerabilities: {
    title: 'Curriculum Vulnerabilities',
    what: 'Every topic you have answered, ranked by how urgently it needs review.',
    formula: [
      'priority = (errorRate × 0.7 + wrong × 3 × 0.3) × recency × weight',
      'recency = 1.2 (< 3 days), 0.9 (> 14 days), else 1.0',
      'weight = min(1, answered ÷ 5)',
    ],
    notes: ['Critical: error rate ≥ 50%. Moderate: 25–49%. Strong: below 25%.'],
  },
  heatmap: {
    title: 'Topic Weakness Heatmap',
    what: 'Error rate for each topic in each day, week or month you studied.',
    formula: ['Cell error rate = wrong ÷ answered in that topic and period × 100'],
    notes: ['Strong < 25%, Moderate 25–49%, Weak ≥ 50%. Empty cells mean no answers in that period.', 'Weeks follow the ISO calendar (Monday start).'],
  },
  calibrationCurve: {
    title: 'Confidence Calibration Analysis',
    what: 'For each confidence level, how often you were right compared with how often you should be.',
    formula: [
      'Expected: level 1 → 20%, 2 → 40%, 3 → 60%, 4 → 80%, 5 → 100%',
      'Actual = correct ÷ answers at that level × 100',
      'Gap = actual − expected',
      'Calibration = 100 − average |gap| across levels you used',
    ],
    notes: ['A negative gap means you were more confident than you were right.'],
  },
  ledger: {
    title: 'Topic Performance Ledger',
    what: 'Raw per-topic numbers you can sort.',
    formula: [
      'Error rate = wrong ÷ answered × 100',
      'Total reps = every answer in the topic, repeats included',
      'Avg time = seconds on timed answers ÷ timed answers',
    ],
  },
} satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof METRICS;

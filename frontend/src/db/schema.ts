export interface AttemptRecord {
  id?: number;
  questionId: string;
  topic: string;
  selectedAnswer: string;
  isCorrect: boolean;
  timeSeconds: number;
  confidence: number; // 1-5 pre-reveal confidence
  grade?: number;
  timestamp: string;
  /** Set when the attempt came from another app's export (e.g. a PelNETS review) */
  source?: 'pelnets';
  /** Times the pick changed before submitting (unindexed, so no schema bump) */
  choiceSwitches?: number;
  /** Absent on older rows, which were all practice */
  mode?: QuizMode;
}

export type QuizMode = 'practice' | 'exam';

export interface SRScheduleRecord {
  questionId: string;
  algorithm: 'SM-2' | 'FSRS' | 'Custom';
  repetitionNumber: number;
  easinessFactor: number;
  stability?: number;
  difficulty?: number;
  intervalDays: number;
  nextReviewDate: string;
  lastReviewDate?: string;
}

export interface TopicStatRecord {
  topic: string;
  totalAttempts: number;
  correctAttempts: number;
  totalTimeSeconds: number;
  lastAttempt: string;
}

export interface SettingRecord {
  key: string;
  value: any;
}

export interface QuestionData {
  id: string;
  year: string;
  season: string;
  paper: string;
  number: number;
  sub_number?: string | null;
  session_id?: string;
  session_title?: string;
  season_title?: string;
  sort_index?: number;
  tags: string[];
  topics: string[];
  subdecks?: string[];
  question: string;
  options: Record<string, string>;
  fallback_choices: string[];
  correct: string;
  correct_display: string;
  explanation: string;
  image_paths: string[];
  all_images: string[];
  is_image_based: boolean;
  created?: string;
  /** Subject B / PM cards with several blanks: each blank's label, correct letter and, when known, its exact choices */
  blanks?: Array<{ label: string; correct: string; choices?: string[] }>;
  /** Choice letters come from the text or the official exam PDF (false: estimated range for an image question) */
  choices_exact?: boolean;
  /** Build-time label: answered from knowledge, or worked out (calculation, tracing, code) */
  kind?: 'recall' | 'solving';
  /** Pseudo-weight for the estimated mock score: 1 light .. 3 heavy */
  weight_tier?: 1 | 2 | 3;
  /** Near-identical stems from other exam sittings share a group */
  repeat_group?: string | null;
  /** Distinct exam years this question (or a near copy) appeared in */
  repeat_count?: number;
}

export interface DeferredRecord {
  id?: number;
  questionId: string;
  topic: string;
  reason: string; // e.g. 'cant_answer_now', 'need_more_study', 'revisit_later'
  deferredAt: string; // ISO timestamp
  resolvedAt?: string; // ISO timestamp when user comes back to it
  sessionContext?: string; // which quiz mode they were in
}

export type SessionType = 'year' | 'topic' | 'combined' | 'custom' | 'srs' | 'set';

/** One question's outcome within a session, kept for the after-session report */
export interface SessionQuestionLog {
  questionId: string;
  timeSeconds: number;
  finalChoice: string | null; // null = skipped
  isCorrect: boolean | null;
  choiceSwitches: number;
  /** The correct choice was picked at some point before the final answer */
  touchedCorrect?: boolean;
  flagged: boolean;
  confidence?: number;
}

export interface SessionRecord {
  id?: number;
  sessionType: SessionType;
  filterKey: string; // e.g. '2024' for year, 'networking' for topic
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  startedAt: string;
  completedAt?: string;
  isCompleted: boolean;
  // Fields below are unindexed and absent on sessions saved before v1.2
  mode?: QuizMode;
  title?: string;
  /** The set in order, so a past report can be rebuilt */
  questionIds?: string[];
  log?: SessionQuestionLog[];
  pauseCount?: number;
}

/** A finished exam on one set. Its unique setKey locks the set until the attempt is reset. */
export interface ExamAttemptRecord {
  id?: number;
  setKey: string;
  title: string;
  sessionId: number;
  completedAt: string;
}

export interface AccountRecord {
  username: string;
  passwordHash: string; // hex PBKDF2-SHA256
  salt: string; // hex
  /** PBKDF2 rounds used for passwordHash; absent on older profiles (150,000) */
  iterations?: number;
  createdAt: string; // ISO timestamp
  /** This profile's study-data scope; absent = the device's default database (first profile) */
  dataId?: string;
  /** Set once the profile is linked to an online (Supabase) account */
  email?: string;
  remoteId?: string;
}


export type ReportKind = 'question' | 'explanation' | 'general';

/** A bug report or content flag. Kept on the device until it reaches the server, then marked sent. */
export interface ReportRecord {
  id?: number;
  /** Generated on the device so a retried send never creates a duplicate row on the server */
  clientId: string;
  kind: ReportKind;
  questionId?: string;
  category: string;
  message: string;
  /** Non-identifying details that help reproduce the problem */
  context: {
    appVersion: string;
    path: string;
    viewport: string;
    displayMode: 'standalone' | 'browser';
    userAgent: string;
    online: boolean;
  };
  createdAt: string; // ISO timestamp
  status: 'queued' | 'sent';
  sentAt?: string;
}

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
}

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

export interface SessionRecord {
  id?: number;
  sessionType: 'year' | 'topic' | 'combined' | 'custom' | 'srs';
  filterKey: string; // e.g. '2024' for year, 'networking' for topic
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  startedAt: string;
  completedAt?: string;
  isCompleted: boolean;
}

export interface AccountRecord {
  username: string;
  passwordHash: string; // hex PBKDF2-SHA256
  salt: string; // hex
  createdAt: string; // ISO timestamp
}


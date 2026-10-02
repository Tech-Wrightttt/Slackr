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

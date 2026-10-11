import type { QuestionData } from '../db/schema';
import { QuestionsService } from './questionsService';
import { StatsDbService } from './statsDb';
import { localDateKey } from './analyticsEngine';

export const DAILY_CHOICES = ['a', 'b', 'c', 'd'] as const;

export interface DailySetState {
  /** Whose set this is: `guest` or `user:<username>`. Each account tracks its own daily progress. */
  owner: string;
  date: string;
  questionIds: string[];
  answers: Record<string, { selected: string; isCorrect: boolean }>;
}

/** Prefixed so a local username can never collide with the guest slot */
export const dailyOwner = (username: string | null) => (username ? `user:${username.toLowerCase()}` : 'guest');

const settingKey = (owner: string, date: string) => `daily_set_${owner}_${date}`;

// mulberry32: tiny deterministic PRNG so every device picks the same set for a date
const seededRandom = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const parseOptions = (q: QuestionData): Record<string, string> => {
  const raw: unknown = q.options;
  if (raw && typeof raw === 'object') return raw as Record<string, string>;
  return {};
};

export const correctChoice = (q: QuestionData) => {
  const c = (q.correct || '').trim().toLowerCase();
  return DAILY_CHOICES.find((k) => c === k || c.startsWith(`${k})`) || c.startsWith(`${k}.`)) ?? null;
};

// Text-only, four-option questions keep the popup small: no diagrams, no FE-B/PM scenarios
const isPopupFriendly = (q: QuestionData) => {
  const opts = parseOptions(q);
  return (
    !q.is_image_based &&
    (q.image_paths?.length ?? 0) === 0 &&
    DAILY_CHOICES.every((k) => typeof opts[k] === 'string' && opts[k].trim() !== '') &&
    correctChoice(q) !== null
  );
};

export class DailySetService {
  static todayKey() {
    return localDateKey(new Date());
  }

  /** Today's 1–5 questions, created on first call and stable for the rest of the day. */
  static async getToday(owner: string): Promise<{ state: DailySetState; questions: QuestionData[] }> {
    const date = this.todayKey();
    const all = await QuestionsService.loadAllQuestions();
    let state = await StatsDbService.getSetting<DailySetState | null>(settingKey(owner, date), null);

    if (!state) {
      const pool = Object.values(all)
        .filter(isPopupFriendly)
        .sort((a, b) => a.id.localeCompare(b.id));
      const rand = seededRandom(Number(date.replace(/-/g, '')));
      const size = 1 + Math.floor(rand() * 5);
      const picked = new Set<string>();
      while (picked.size < Math.min(size, pool.length)) picked.add(pool[Math.floor(rand() * pool.length)]!.id);
      state = { owner, date, questionIds: [...picked], answers: {} };
      await StatsDbService.setSetting(settingKey(owner, date), state);
    }

    const questions = state.questionIds.map((id) => all[id]).filter((q): q is QuestionData => !!q);
    return { state, questions };
  }

  static isComplete(state: DailySetState) {
    return state.questionIds.every((id) => state.answers[id]);
  }

  /** Grades the answer and logs it as a normal attempt so it feeds analytics, SRS and the tracker. */
  static async answer(
    state: DailySetState,
    question: QuestionData,
    selected: string,
    timeSeconds: number
  ): Promise<DailySetState> {
    if (state.answers[question.id]) return state;
    const isCorrect = selected === correctChoice(question);
    await StatsDbService.recordAttempt(question.id, question.topics?.[0] || 'software', selected, isCorrect, timeSeconds);
    const next = { ...state, answers: { ...state.answers, [question.id]: { selected, isCorrect } } };
    await StatsDbService.setSetting(settingKey(state.owner, state.date), next);
    return next;
  }
}

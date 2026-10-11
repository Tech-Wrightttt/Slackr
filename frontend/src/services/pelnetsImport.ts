import type { AttemptRecord, DeferredRecord } from '../db/schema';
import { QuestionsService } from './questionsService';

/**
 * Adapter for PelNETS progress exports (`philnits-progress-v2-*.json`).
 *
 * PelNETS is a flashcard-style reviewer over the same PhilNITS question vault, so its card IDs
 * map onto SLACKR's question IDs once the vault folder prefix is dropped
 * (`2007/2007A_FE_46` -> `2007A_FE_46`, `PM/2009A_FE_PM_4.1` -> `2009A_FE_PM_4.1`).
 * Each review becomes a SLACKR attempt; the result is then merged by SyncService like any
 * other backup, so re-importing the same file is a no-op.
 */

type PelnetsResult = 'again' | 'hard' | 'good' | 'easy';

interface PelnetsReview {
  questionId: string;
  date?: string;
  timestamp?: number;
  result: string;
}

interface PelnetsCard {
  id: string;
  topic?: string;
}

interface PelnetsListItem {
  listId: string;
  cardId: string;
  addedAt?: number;
}

// PelNETS self-grades recall; map it onto SLACKR's 1-5 pre-reveal confidence scale
const CONFIDENCE: Record<PelnetsResult, number> = { again: 2, hard: 3, good: 4, easy: 5 };

export const isPelnetsExport = (json: any): boolean =>
  !!json &&
  typeof json === 'object' &&
  !Array.isArray(json.attempts) &&
  Array.isArray(json.history) &&
  Array.isArray(json.questions) &&
  json.history.every((h: any) => h && typeof h.questionId === 'string' && typeof h.result === 'string');

// PelNETS prefixes IDs with their vault folder (`2007/…`, `PM/…`); SLACKR IDs are the file name alone
const toSlackrId = (pelnetsId: string) => String(pelnetsId).split('/').pop() ?? '';

export interface PelnetsConversion {
  /** SLACKR backup shape, ready for SyncService.importLocalData */
  backup: { attempts: AttemptRecord[]; bookmarks: string[]; deferred: DeferredRecord[] };
  /** Reviews whose question isn't in SLACKR's question bank */
  unmatchedReviews: number;
  questionCount: number;
}

export async function convertPelnetsExport(json: any): Promise<PelnetsConversion> {
  const bank = await QuestionsService.loadAllQuestions();
  const cardTopic = new Map<string, string>();
  for (const card of json.questions as PelnetsCard[]) {
    if (card?.id && card.topic) cardTopic.set(toSlackrId(card.id), card.topic);
  }

  const attempts: AttemptRecord[] = [];
  const questions = new Set<string>();
  let unmatchedReviews = 0;

  for (const review of json.history as PelnetsReview[]) {
    const result = review.result as PelnetsResult;
    if (!(result in CONFIDENCE)) continue;
    const questionId = toSlackrId(review.questionId);
    const question = bank[questionId];
    if (!question) {
      unmatchedReviews++;
      continue;
    }
    const when =
      typeof review.timestamp === 'number'
        ? new Date(review.timestamp)
        : review.date
          ? new Date(`${review.date}T12:00:00`)
          : null;
    if (!when || Number.isNaN(when.getTime())) continue;

    questions.add(questionId);
    attempts.push({
      questionId,
      topic: question.topics?.[0] || cardTopic.get(questionId) || 'software',
      selectedAnswer: '', // PelNETS records recall, not which choice was picked
      isCorrect: result !== 'again',
      timeSeconds: 0, // not tracked by PelNETS; excluded from pace averages
      confidence: CONFIDENCE[result],
      timestamp: when.toISOString(),
      source: 'pelnets',
    });
  }

  const items = Array.isArray(json.listItems) ? (json.listItems as PelnetsListItem[]) : [];
  const inBank = (item: PelnetsListItem) => !!bank[toSlackrId(item.cardId)];
  const bookmarks = items.filter((i) => i.listId === 'liked' && inBank(i)).map((i) => toSlackrId(i.cardId));
  const deferred: DeferredRecord[] = items
    .filter((i) => i.listId === 'skipped' && inBank(i))
    .map((i) => {
      const questionId = toSlackrId(i.cardId);
      return {
        questionId,
        topic: bank[questionId]?.topics?.[0] || 'software',
        reason: 'skipped_in_pelnets',
        deferredAt: new Date(i.addedAt ?? Date.now()).toISOString(),
        sessionContext: 'pelnets',
      };
    });

  return { backup: { attempts, bookmarks, deferred }, unmatchedReviews, questionCount: questions.size };
}

import type { QuestionData } from '../db/schema';

let cachedQuestions: Record<string, QuestionData> | null = null;
let cachedMetadata: any = null;

export interface ExamSession {
  session_id: string;
  session_title: string;
  season_title: string;
  year: string;
  season: string;
  paper: string;
  question_count: number;
  first_q: number;
  last_q: number;
}

export class QuestionsService {
  /**
   * Universal PelNETS Sorting Algorithm:
   * 1. Year (descending 2026 down to 2007)
   * 2. Season: Spring ('S') before Autumn ('A')
   * 3. Paper: Subject A / Morning ('FE-A' | 'AM') before Subject B / Afternoon ('FE-B' | 'PM')
   * 4. Question Number: 1 to 80 (strict numerical sort)
   * 5. Subquestion Number: 1.1, 1.2, 1.3...
   */
  static sortQuestionsStrict(questions: QuestionData[]): QuestionData[] {
    return [...questions].sort((a, b) => {
      // 1. Year (descending)
      const yearA = parseInt(a.year, 10) || 0;
      const yearB = parseInt(b.year, 10) || 0;
      if (yearA !== yearB) return yearB - yearA;

      // 2. Use precomputed sort_index if present
      if (a.sort_index !== undefined && b.sort_index !== undefined) {
        if (a.sort_index !== b.sort_index) return a.sort_index - b.sort_index;
      }

      // Fallback manual sort:
      // Season: S (0) before A (1)
      const sA = a.season === 'S' ? 0 : 1;
      const sB = b.season === 'S' ? 0 : 1;
      if (sA !== sB) return sA - sB;

      // Paper: FE-A / AM (0) before FE-B / PM (1)
      const pA = ['FE-A', 'AM'].includes(a.paper) ? 0 : 1;
      const pB = ['FE-A', 'AM'].includes(b.paper) ? 0 : 1;
      if (pA !== pB) return pA - pB;

      // Question Number (numerical)
      if (a.number !== b.number) return a.number - b.number;

      // Sub-number
      const subA = a.sub_number ? parseFloat(a.sub_number) : 0;
      const subB = b.sub_number ? parseFloat(b.sub_number) : 0;
      return subA - subB;
    });
  }

  static async loadAllQuestions(): Promise<Record<string, QuestionData>> {
    if (cachedQuestions) {
      return cachedQuestions;
    }

    try {
      // 1. Try static JSON bundle (instant, works 100% offline!)
      const res = await fetch('/data/questions_index.json');
      if (res.ok) {
        cachedQuestions = await res.json();
        return cachedQuestions!;
      }
    } catch (e) {
      console.warn('Could not load static questions_index.json, trying backend API...');
    }

    try {
      // 2. Fallback to companion API
      const res = await fetch('/api/questions?page_size=500');
      if (res.ok) {
        const data = await res.json();
        cachedQuestions = {};
        for (const item of data.items) {
          cachedQuestions[item.id] = item;
        }
        return cachedQuestions;
      }
    } catch (e) {
      console.error('Failed to load questions from both static and API:', e);
    }

    return {};
  }

  static async loadMetadataSummary() {
    if (cachedMetadata) return cachedMetadata;
    try {
      const res = await fetch('/data/metadata_summary.json');
      if (res.ok) {
        cachedMetadata = await res.json();
        return cachedMetadata;
      }
    } catch (e) {
      // Fallback
    }

    const questions = await this.loadAllQuestions();
    const yearsSet = new Set<string>();
    const yearCounts: Record<string, number> = {};
    const topicsSet = new Set<string>();
    const topicCounts: Record<string, number> = {};
    const sessionsByYear: Record<string, ExamSession[]> = {};

    for (const q of Object.values(questions)) {
      if (q.year) {
        yearsSet.add(q.year);
        yearCounts[q.year] = (yearCounts[q.year] || 0) + 1;
      }
      for (const t of q.topics || []) {
        topicsSet.add(t);
        topicCounts[t] = (topicCounts[t] || 0) + 1;
      }
    }

    cachedMetadata = {
      total_questions: Object.keys(questions).length,
      years: Array.from(yearsSet).sort().reverse(),
      year_counts: yearCounts,
      topics: Array.from(topicsSet).sort(),
      topic_counts: topicCounts,
      sessions_by_year: sessionsByYear,
    };
    return cachedMetadata;
  }

  /**
   * Get all questions for an exam year, optionally filtered to a specific session (e.g. 2024S_FE-A)
   */
  static async getQuestionsByYear(year: string, sessionId?: string): Promise<QuestionData[]> {
    const all = await this.loadAllQuestions();
    const filtered = Object.values(all).filter((q) => {
      if (q.year !== year) return false;
      if (sessionId && sessionId !== 'all' && q.session_id !== sessionId) return false;
      return true;
    });
    return this.sortQuestionsStrict(filtered);
  }

  /**
   * Get all sessions for a specific exam year
   */
  static async getSessionsForYear(year: string): Promise<ExamSession[]> {
    const meta = await this.loadMetadataSummary();
    if (meta.sessions_by_year && meta.sessions_by_year[year]) {
      return meta.sessions_by_year[year];
    }

    const all = await this.loadAllQuestions();
    const yearQuestions = Object.values(all).filter((q) => q.year === year);
    const sessionsMap = new Map<string, ExamSession>();

    for (const q of yearQuestions) {
      const sId = q.session_id || `${q.year}${q.season}_${q.paper}`;
      if (!sessionsMap.has(sId)) {
        sessionsMap.set(sId, {
          session_id: sId,
          session_title: q.session_title || sId,
          season_title: q.season_title || q.season,
          year: q.year,
          season: q.season,
          paper: q.paper,
          question_count: 0,
          first_q: 9999,
          last_q: 0,
        });
      }
      const sEntry = sessionsMap.get(sId)!;
      sEntry.question_count++;
      if (q.number > 0) {
        sEntry.first_q = Math.min(sEntry.first_q, q.number);
        sEntry.last_q = Math.max(sEntry.last_q, q.number);
      }
    }

    const list = Array.from(sessionsMap.values());
    list.sort((a, b) => {
      const sA = a.season === 'S' ? 0 : 1;
      const sB = b.season === 'S' ? 0 : 1;
      if (sA !== sB) return sA - sB;
      const pA = ['FE-A', 'AM'].includes(a.paper) ? 0 : 1;
      const pB = ['FE-A', 'AM'].includes(b.paper) ? 0 : 1;
      return pA - pB;
    });

    return list;
  }

  /**
   * Get all questions for a topic, optionally filtered by a specific year (Subdeck: #<category>/YYYY)
   */
  static async getQuestionsByTopic(topic: string, year?: string): Promise<QuestionData[]> {
    const all = await this.loadAllQuestions();
    const tLower = topic.toLowerCase();
    const filtered = Object.values(all).filter((q) => {
      const topicMatch = q.topics?.some((t) => t.toLowerCase() === tLower);
      if (!topicMatch) return false;
      if (year && year !== 'all' && q.year !== year) return false;
      return true;
    });
    return this.sortQuestionsStrict(filtered);
  }

  /**
   * Combined filters: Year AND Topic
   */
  static async getQuestionsCombined(year?: string, topic?: string): Promise<QuestionData[]> {
    const all = await this.loadAllQuestions();
    const filtered = Object.values(all).filter((q) => {
      const yearMatch = !year || year === 'all' || q.year === year;
      const topicMatch = !topic || topic === 'all' || q.topics?.some((t) => t.toLowerCase() === topic.toLowerCase());
      return yearMatch && topicMatch;
    });
    return this.sortQuestionsStrict(filtered);
  }

  static async getQuestionById(id: string): Promise<QuestionData | null> {
    const all = await this.loadAllQuestions();
    return all[id] || null;
  }

  static async getCustomQuestions(ids: string[]): Promise<QuestionData[]> {
    const all = await this.loadAllQuestions();
    const list = ids.map((id) => all[id]).filter(Boolean);
    return this.sortQuestionsStrict(list);
  }
}

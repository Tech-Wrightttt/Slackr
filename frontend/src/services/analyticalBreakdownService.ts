import { LocalJsonStore } from './localJsonStore';
import { apiUrl } from '../config/env';

export interface AnalyticalStep {
  id: string;
  stepNumber: string; // e.g. "01", "02", "03"
  title: string;
  content: string;
  type?: 'standard' | 'parameter' | 'formula' | 'conclusion' | 'trap';
  parameters?: Array<{ label: string; value: string; subtext?: string }>;
  formula?: { label: string; expression: string; steps?: string[]; result?: string };
}

export interface BreakdownsData {
  questions: Record<string, AnalyticalStep[]>;
}

let memoryCache: BreakdownsData | null = null;

const store = new LocalJsonStore<BreakdownsData>({
  storageKey: 'slackr_analytical_breakdowns_cache',
  apiUrl: apiUrl('/api/analytical-breakdowns'),
  staticUrl: '/data/analytical_breakdowns.json',
  empty: () => ({ questions: {} }),
});

const normalize = (d: Partial<BreakdownsData> | null | undefined): BreakdownsData => ({
  questions: d?.questions && typeof d.questions === 'object' ? d.questions : {},
});

export class AnalyticalBreakdownService {
  /** True when the last save reached the project JSON file; false = saved on this device only. */
  static get lastSavedRemotely(): boolean {
    return store.lastSavedRemotely;
  }

  /**
   * Load all custom breakdowns (local-first, works offline).
   */
  static async loadAll(): Promise<BreakdownsData> {
    if (memoryCache) {
      return memoryCache;
    }
    memoryCache = normalize(await store.load());
    return memoryCache;
  }

  static isBreakdownsShape(json: any): boolean {
    if (!json || typeof json !== 'object' || json.topics || !json.questions) return false;
    const sample = Object.values(json.questions)[0] as any;
    return sample === undefined || (Array.isArray(sample) && (sample.length === 0 || 'stepNumber' in sample[0] || 'title' in sample[0]));
  }

  /** Import an analytical_breakdowns.json (or the block inside a full backup). Works offline. */
  static async importData(
    incoming: Partial<BreakdownsData>,
    strategy: 'merge' | 'replace'
  ): Promise<{ count: number; savedRemotely: boolean }> {
    const clean = normalize(incoming);
    const next: BreakdownsData =
      strategy === 'replace'
        ? clean
        : { questions: { ...(await this.loadAll()).questions, ...clean.questions } };
    memoryCache = next;
    const savedRemotely = await store.save(next);
    return { count: Object.keys(clean.questions).length, savedRemotely };
  }

  /**
   * Get steps for a specific question: a saved custom breakdown, or steps split from its explanation.
   */
  static async getStepsForQuestion(params: {
    questionId?: string;
    topics?: string[];
    explanation?: string;
    correctDisplay?: string;
    selectedAnswer?: string;
    questionText?: string;
  }): Promise<AnalyticalStep[]> {
    const { questionId, topics = [], explanation = '', correctDisplay = '', selectedAnswer = '' } = params;

    const data = await this.loadAll();

    // 1. If user previously customized steps for this question, return them (minus unfilled placeholders)
    const saved = questionId ? data.questions?.[questionId] : undefined;
    if (saved) {
      const filled = saved.filter((st) => !(st.title === 'New Analytical Step' && /^Enter derivation details/i.test(st.content.trim())));
      // Older builds auto-saved a generic template ("Extracted Operational Parameters" etc.); regenerate those
      const isOldTemplate = filled.some((st) => st.parameters?.some((p) => p.value === 'Given in Table'));
      if (filled.length > 0 && !isOldTemplate) return filled;
    }

    // 2. Otherwise generate tailored structured steps catered to question type
    return this.generateTailoredSteps({
      questionId,
      topics,
      explanation,
      correctDisplay,
      selectedAnswer,
    });
  }

  /**
   * Save edited breakdown steps for a question to JSON and local cache.
   */
  static async saveStepsForQuestion(
    questionId: string,
    steps: AnalyticalStep[]
  ): Promise<boolean> {
    const data = await this.loadAll();
    if (!data.questions) data.questions = {};
    data.questions[questionId] = steps;

    memoryCache = data;
    return store.save(data);
  }

  /**
   * Build steps from the question's own explanation: each "Step N:" (or heading) becomes a step,
   * followed by the official answer. Nothing is invented: no placeholder parameters, formulas or traps.
   */
  static generateTailoredSteps(params: {
    questionId?: string;
    topics: string[];
    explanation: string;
    correctDisplay: string;
    selectedAnswer: string;
  }): AnalyticalStep[] {
    const { explanation, correctDisplay } = params;

    // Drop the explanation heading, horizontal rules and everything from the references list on
    const lines: string[] = [];
    for (const raw of explanation.split('\n')) {
      const line = raw.trimEnd();
      if (/^#{1,6}\s*references\b/i.test(line.trim()) || /^\**references\**:?$/i.test(line.trim())) break;
      if (/^#{1,6}\s*explanation\b/i.test(line.trim()) || /^-{3,}$/.test(line.trim())) continue;
      lines.push(line);
    }

    const STEP_RE = /^\s*(?:#{1,6}\s*)?\**\s*step\s*(\d+)\s*[:.)\-–]?\s*\**\s*(.*)$/i;
    const HEADING_RE = /^\s*#{1,6}\s+(.+)$/;
    const sections: { title: string; body: string[] }[] = [];
    let current: { title: string; body: string[] } | null = null;

    for (const line of lines) {
      const step = line.match(STEP_RE);
      const heading = step ? null : line.match(HEADING_RE);
      if (step || heading) {
        const title = (step ? step[2] : heading![1]).replace(/\*\*/g, '').replace(/[:.]\s*$/, '').trim();
        current = { title: title || `Step ${step ? step[1] : sections.length + 1}`, body: [] };
        sections.push(current);
      } else if (current) {
        current.body.push(line);
      } else if (line.trim()) {
        current = { title: 'Overview', body: [line] };
        sections.push(current);
      }
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    const steps: AnalyticalStep[] = sections
      .map((sec) => ({ ...sec, text: sec.body.join('\n').trim() }))
      .filter((sec) => sec.text || sec.title !== 'Overview')
      .map((sec, i) => ({
        id: `step-${i + 1}`,
        stepNumber: pad(i + 1),
        title: sec.title,
        content: sec.text,
        type: 'standard' as const,
      }));

    steps.push({
      id: `step-${steps.length + 1}`,
      stepNumber: pad(steps.length + 1),
      title: 'Answer',
      content: correctDisplay
        ? `The official answer is **${correctDisplay}**.`
        : 'No written explanation is available for this question yet.',
      type: 'conclusion',
    });
    return steps;
  }
}

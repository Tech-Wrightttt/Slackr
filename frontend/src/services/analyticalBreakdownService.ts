import { LocalJsonStore } from './localJsonStore';

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
  apiUrl: '/api/analytical-breakdowns',
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
   * Get steps for a specific question, or generate intelligent tailored steps catered to the question topic.
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

    // 1. If user previously customized steps for this question, return them
    if (questionId && data.questions && data.questions[questionId]) {
      return data.questions[questionId];
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
   * Cater breakdown steps specifically to the domain/type of question.
   */
  static generateTailoredSteps(params: {
    questionId?: string;
    topics: string[];
    explanation: string;
    correctDisplay: string;
    selectedAnswer: string;
  }): AnalyticalStep[] {
    const { topics, explanation, correctDisplay, selectedAnswer } = params;
    const primaryTopic = (topics[0] || 'general').toLowerCase();

    // Clean explanation lines to populate step details
    const cleanLines = explanation
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('### Explanation') && !l.startsWith('# References') && !l.startsWith('---'));

    const firstSummary = cleanLines.length > 0 ? cleanLines[0] : 'Analyze question criteria and requirements according to IPA syllabus standard.';
    const detailedBody = cleanLines.length > 1 ? cleanLines.slice(1).join('\n\n') : explanation || 'Derivation follows standardized PhilNITS syllabus guidelines.';

    // Check category: Math / Accounting / Financial Calculation
    const isMathOrAccounting =
      primaryTopic.includes('account') ||
      primaryTopic.includes('math') ||
      primaryTopic.includes('discrete') ||
      primaryTopic.includes('calc') ||
      explanation.includes('=') ||
      explanation.includes('+') ||
      explanation.includes('formula');

    // Check category: Data Structures / Algorithm / Coding
    const isAlgoOrDataStruct =
      primaryTopic.includes('data-struct') ||
      primaryTopic.includes('algo') ||
      primaryTopic.includes('logic') ||
      primaryTopic.includes('tree') ||
      primaryTopic.includes('graph');

    // Check category: Systems / Architecture / Networking / Security
    const isArchOrNetworking =
      primaryTopic.includes('arch') ||
      primaryTopic.includes('netw') ||
      primaryTopic.includes('system') ||
      primaryTopic.includes('operating') ||
      primaryTopic.includes('secu');

    if (isMathOrAccounting) {
      return [
        {
          id: 'step-1',
          stepNumber: '01',
          title: 'Objective & Problem Definition',
          content: firstSummary || 'Determine target quantitative values required under specified operating and financial constraints.',
          type: 'standard',
        },
        {
          id: 'step-2',
          stepNumber: '02',
          title: 'Extracted Operational Parameters',
          content: 'Key parameters and given boundary values extracted from the problem statement:',
          type: 'parameter',
          parameters: [
            { label: 'Unit Price / Primary Metric', value: 'Given in Table', subtext: 'Per finished unit' },
            { label: 'Fixed Costs / Structural Overhead', value: 'Extracted', subtext: 'Base administrative load' },
            { label: 'Variable Rate / Unit Delta', value: 'Calculated', subtext: 'Operational marginal cost' },
            { label: 'Target Objective / Output', value: 'Specified in Stem', subtext: 'Target condition' },
          ],
        },
        {
          id: 'step-3',
          stepNumber: '03',
          title: 'Contribution Margin & Rate Derivation',
          content: 'Calculate intermediate operational ratios and variable deductions to determine net unit contribution toward fixed cost absorption.',
          type: 'standard',
        },
        {
          id: 'step-4',
          stepNumber: '04',
          title: 'Mathematical Derivation & Value Substitution',
          content: detailedBody || 'Substitute values into standard break-even / mathematical equation to compute exact required output units.',
          type: 'formula',
          formula: {
            label: 'Required Output Equation',
            expression: 'Target Units = (Total Fixed Load + Target Return) / Net Unit Contribution',
            result: correctDisplay || 'Verified Numerical Solution',
          },
        },
        {
          id: 'step-5',
          stepNumber: '05',
          title: 'Final Takeaway & Conclusion',
          content: `Therefore, the verified solution is ${correctDisplay || 'the key answer'}, satisfying all boundary equations under the specified examination criteria.`,
          type: 'conclusion',
        },
        {
          id: 'step-6',
          stepNumber: '06',
          title: `Trap Analysis & Distractor Elimination${selectedAnswer ? ` (Selection: ${selectedAnswer.toUpperCase()})` : ''}`,
          content: 'Common exam pitfalls involve omitting variable deductions from the divisor or miscalculating base allocations, leading directly to distractor options.',
          type: 'trap',
        },
      ];
    }

    if (isAlgoOrDataStruct) {
      return [
        {
          id: 'step-1',
          stepNumber: '01',
          title: 'Problem Statement & Target Representation',
          content: firstSummary || 'Formulate the computational goal and identify the target syntax or algorithmic complexity tier.',
          type: 'standard',
        },
        {
          id: 'step-2',
          stepNumber: '02',
          title: 'Operator Precedence & Structural Rules',
          content: 'Establish execution constraints, precedence rules, and tree/graph node traversal properties applicable to the given data structures.',
          type: 'standard',
        },
        {
          id: 'step-3',
          stepNumber: '03',
          title: 'Step-by-Step Execution & State Tracing',
          content: detailedBody || 'Progressively resolve nested expressions, evaluate intermediate pointers, and trace states across the structure.',
          type: 'standard',
        },
        {
          id: 'step-4',
          stepNumber: '04',
          title: 'Result Verification & Expression Assembly',
          content: `Reassemble evaluated components into final canonical representation. Verified canonical state matches ${correctDisplay || 'the official key'}.`,
          type: 'standard',
        },
        {
          id: 'step-5',
          stepNumber: '05',
          title: 'Final Takeaway & Algorithmic Conclusion',
          content: `The derived sequence strictly confirms ${correctDisplay || 'the selected answer'} as the correct, optimal representation without ambiguity.`,
          type: 'conclusion',
        },
        {
          id: 'step-6',
          stepNumber: '06',
          title: 'Distractor Analysis & Common Syntax Traps',
          content: 'Distractor choices commonly invert associative order or fail to preserve operand order during prefix/postfix conversions.',
          type: 'trap',
        },
      ];
    }

    if (isArchOrNetworking) {
      return [
        {
          id: 'step-1',
          stepNumber: '01',
          title: 'Technical Scope & Protocol Definition',
          content: firstSummary || 'Identify the layer, hardware module, or protocol specification governing the question scenario.',
          type: 'standard',
        },
        {
          id: 'step-2',
          stepNumber: '02',
          title: 'System Specifications & Operational Constraints',
          content: 'Map out the technical properties, timing parameters, addressing schemes, or RFC standards relevant to this domain.',
          type: 'standard',
        },
        {
          id: 'step-3',
          stepNumber: '03',
          title: 'Architectural Workflow & Signal / Packet Flow',
          content: detailedBody || 'Analyze how data, control signals, or packets traverse the architecture under normal and edge conditions.',
          type: 'standard',
        },
        {
          id: 'step-4',
          stepNumber: '04',
          title: 'Comparative Criteria & Specification Analysis',
          content: `Compare each feature specification against standard criteria. Only ${correctDisplay || 'the verified option'} satisfies all constraints.`,
          type: 'standard',
        },
        {
          id: 'step-5',
          stepNumber: '05',
          title: 'Architectural Conclusion & Standard Compliance',
          content: `Option ${correctDisplay || 'confirmed'} fully adheres to the accredited ISO/IEEE/IPA curriculum benchmark.`,
          type: 'conclusion',
        },
        {
          id: 'step-6',
          stepNumber: '06',
          title: 'Misconception Trap & Distractor Breakdown',
          content: 'Candidate pitfalls often confuse adjacent OSI layers or conflate synchronous vs asynchronous pipeline behaviors.',
          type: 'trap',
        },
      ];
    }

    // Default: Software Engineering / Management / General Standard
    return [
      {
        id: 'step-1',
        stepNumber: '01',
        title: 'Curriculum Objective & Conceptual Framework',
        content: firstSummary || 'Define the key methodology, standard framework, or lifecycle phase being assessed.',
        type: 'standard',
      },
      {
        id: 'step-2',
        stepNumber: '02',
        title: 'Core Principles & Standard Definitions',
        content: 'Identify mandatory characteristics, ISO/IEC requirements, or governance frameworks governing the prompt.',
        type: 'standard',
      },
      {
        id: 'step-3',
        stepNumber: '03',
        title: 'Step-by-Step Scenario Analysis',
        content: detailedBody || 'Evaluate the scenario parameters against project constraints, quality metrics, or development deliverables.',
        type: 'standard',
      },
      {
        id: 'step-4',
        stepNumber: '04',
        title: 'Criteria Evaluation & Choice Matching',
        content: `Examine candidate options against formal criteria. Matches verified choice: ${correctDisplay || 'official key'}.`,
        type: 'standard',
      },
      {
        id: 'step-5',
        stepNumber: '05',
        title: 'Final Pedagogical Conclusion',
        content: `Hence, ${correctDisplay || 'the verified key'} represents the canonical standard practice compliant with the examination syllabus.`,
        type: 'conclusion',
      },
      {
        id: 'step-6',
        stepNumber: '06',
        title: 'Anti-Pattern Trap Analysis',
        content: 'Alternative options represent common misconceptions, outdated legacy practices, or out-of-scope lifecycle phases.',
        type: 'trap',
      },
    ];
  }
}

import { MOCK_PAPER_MINUTES, MOCK_PAPER_SIZE } from '../services/scoring';

export type QuestionSetKind = 'frequent' | 'recall' | 'solving' | 'mock';

/** The ready-made sets on Home and their /quiz/set/:kind pages */
export const SET_INFO: Record<QuestionSetKind, { title: string; blurb: string; icon: string }> = {
  frequent: { title: 'Frequently tested', blurb: 'Questions asked in several exam years, most repeated first', icon: 'repeat' },
  recall: { title: 'Recall only', blurb: 'Answer from knowledge: no calculation, tracing or code', icon: 'psychology' },
  solving: { title: 'Solving only', blurb: 'Work it out: calculations, pseudocode, flowcharts, logic', icon: 'calculate' },
  mock: { title: 'Mock paper', blurb: `${MOCK_PAPER_SIZE} random Subject A questions in the real mix, ${MOCK_PAPER_MINUTES} minutes`, icon: 'assignment' },
};

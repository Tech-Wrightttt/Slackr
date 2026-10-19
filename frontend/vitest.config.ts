import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests for the pure services (run through ../scripts/run_tests.py, which turns the results into a PDF).
// Kept apart from vite.config.ts so the dev-server plugins never load under test.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('test') },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Coverage is reported for the units under test, not the whole UI
      include: [
        'src/services/passwordPolicy.ts',
        'src/services/srsEngine.ts',
        'src/services/questionsService.ts',
        'src/services/searchEngine.ts',
        'src/services/topicColors.ts',
        'src/services/choiceOrder.ts',
        'src/services/scoring.ts',
        'src/services/sessionReport.ts',
        'src/services/examClock.ts',
        'src/services/examService.ts',
        'src/services/yearDetail.ts',
        'src/components/drawGestures.ts',
      ],
      reporter: ['text-summary', 'json-summary', 'json'],
    },
  },
});

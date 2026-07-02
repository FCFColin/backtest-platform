import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

const frontendUtils = [
  'api-client',
  'auth-tokens',
  'chart-data-merge',
  'config-api',
  'format',
  'portfolio-storage',
  'ticker-presets',
  'url-state',
].map((f) => `tests/unit/utils/${f}.test.ts`);

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/unit/store/**', 'tests/unit/hooks/**', 'tests/unit/lib/**', ...frontendUtils],
    coverage: baseConfig.test?.coverage
      ? {
          ...baseConfig.test.coverage,
          include: ['src/**/*.{ts,tsx}'],
        }
      : undefined,
  },
});

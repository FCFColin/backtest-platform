import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

const backendUtils = [
  'date-utils',
  'engine-body-builder',
  'engine-client',
  'errors',
  'integrity',
  'log-sanitizer',
  'logger',
  'metrics',
  'numeric-range',
  'request-context',
  'ticker-validation',
].map((f) => `tests/unit/utils/${f}.test.ts`);

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      'tests/unit/api/**',
      'tests/unit/application/**',
      'tests/unit/config/**',
      'tests/unit/db/**',
      'tests/unit/domain/**',
      'tests/unit/engine/**',
      'tests/unit/middleware/**',
      'tests/unit/queues/**',
      'tests/unit/routes/**',
      'tests/unit/schemas/**',
      'tests/unit/server/**',
      'tests/unit/services/**',
      ...backendUtils,
    ],
    coverage: baseConfig.test?.coverage
      ? {
          ...baseConfig.test.coverage,
          include: ['packages/backend/src/**/*.{ts,tsx}'],
        }
      : undefined,
  },
});

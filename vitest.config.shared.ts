import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['packages/shared/**/*.test.ts'],
    coverage: baseConfig.test?.coverage
      ? {
          ...baseConfig.test.coverage,
          include: ['packages/shared/**/*.{ts,tsx}'],
        }
      : undefined,
  },
});

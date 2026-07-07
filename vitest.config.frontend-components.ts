import { defineConfig } from 'vitest/config';
import path from 'path';
import frontendConfig from './vitest.config.frontend.js';

export default defineConfig({
  ...frontendConfig,
  resolve: {
    ...frontendConfig.resolve,
    alias: {
      ...((frontendConfig.resolve?.alias as Record<string, string>) ?? {}),
      'react-router-dom': path.resolve(__dirname, 'tests/mocks/react-router-dom.tsx'),
    },
  },
  test: {
    ...frontendConfig.test,
    include: [
      ...(frontendConfig.test?.include ?? []),
      'tests/unit/components/**',
      'tests/unit/store/utils/**',
    ],
    coverage: frontendConfig.test?.coverage
      ? {
          ...frontendConfig.test.coverage,
          exclude: ((frontendConfig.test.coverage.exclude as string[]) ?? []).filter(
            (e) => e !== 'packages/frontend/src/components/**',
          ),
        }
      : undefined,
  },
});

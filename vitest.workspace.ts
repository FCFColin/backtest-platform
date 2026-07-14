import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * 统一 Vitest 工作区配置
 *
 * 取代原先 7 个 vitest 配置文件（vitest.config.ts + 5 个子配置 + workspace）。
 * 项目分层：default（杂项/集成/contract/fuzz/property）→ backend → frontend → shared → chaos。
 * Coverage 设置在根 test 层，所有项目共享。
 */

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

/**
 * 根级 Coverage 配置（所有项目共享）
 */
const coverageConfig = {
  provider: 'v8',
  reporter: ['html', 'lcov', 'text', 'json-summary'],
  reportsDirectory: 'coverage/vitest',
  include: ['packages/backend/src/**/*.{ts,tsx}', 'packages/frontend/src/**/*.{ts,tsx}'],
  exclude: [
    'packages/frontend/src/**/*.d.ts',
    'packages/frontend/src/**/*.test.{ts,tsx}',
    'packages/frontend/src/i18n/**',
    'packages/frontend/src/vite-env.d.ts',
    'packages/frontend/src/pages/**',
    'packages/frontend/src/components/**',
    'packages/frontend/src/App.tsx',
    'packages/frontend/src/main.tsx',
    'packages/backend/src/utils/logger.ts',
    'packages/backend/src/utils/metrics.ts',
    'packages/backend/src/db/import.ts',
    'packages/backend/src/app.ts',
    'packages/backend/src/services/mailService.ts',
    'packages/backend/src/services/billingService.ts',
  ],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 70,
    statements: 80,
  },
} as const;

export default defineWorkspace([
  // ── default：集成 / contract / fuzz / property / e2e 辅助 ──
  {
    test: {
      name: 'default',
      globals: true,
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/property/**/*.pbt.ts'],
      exclude: [
        'tests/**/*.spec.ts',
        'tests/chaos/**',
        'tests/**/*.bench.ts',
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
        'tests/unit/services/**',
        'tests/unit/store/**',
        'tests/unit/hooks/**',
        'tests/unit/components/**',
        'tests/unit/store/utils/**',
        ...backendUtils,
        ...frontendUtils,
      ],
      testTimeout: 30000,
      hookTimeout: 60000,
      coverage: coverageConfig,
    },
  },
  // ── backend：后端单元测试 ──
  {
    test: {
      name: 'backend',
      globals: true,
      include: [
        'tests/unit/api/**/*.test.ts',
        'tests/unit/application/**/*.test.ts',
        'tests/unit/config/**/*.test.ts',
        'tests/unit/db/**/*.test.ts',
        'tests/unit/domain/**/*.test.ts',
        'tests/unit/engine/**/*.test.ts',
        'tests/unit/middleware/**/*.test.ts',
        'tests/unit/queues/**/*.test.ts',
        'tests/unit/routes/**/*.test.ts',
        'tests/unit/schemas/**/*.test.ts',
        'tests/unit/services/**/*.test.ts',
        ...backendUtils,
      ],
      deps: {
        moduleDirectories: ['node_modules', 'packages/backend/node_modules'],
      },
    },
    resolve: {
      alias: {
        opossum: path.resolve(__dirname, 'packages/backend/node_modules/opossum'),
        pg: path.resolve(__dirname, 'packages/backend/node_modules/pg'),
        jose: path.resolve(__dirname, 'packages/backend/node_modules/jose'),
        argon2: path.resolve(__dirname, 'packages/backend/node_modules/argon2'),
        bullmq: path.resolve(__dirname, 'packages/backend/node_modules/bullmq'),
      },
    },
  },
  // ── frontend：前端单元测试 + 组件测试 ──
  {
    plugins: [react()],
    test: {
      name: 'frontend',
      globals: true,
      include: [
        'tests/unit/store/**/*.test.ts',
        'tests/unit/store/**/*.test.tsx',
        'tests/unit/hooks/**/*.test.ts',
        'tests/unit/hooks/**/*.test.tsx',
        'tests/unit/components/**/*.test.ts',
        'tests/unit/components/**/*.test.tsx',
        'tests/unit/store/utils/**/*.test.ts',
        'tests/unit/store/utils/**/*.test.tsx',
        ...frontendUtils,
      ],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './packages/frontend/src'),
        'react-router-dom': path.resolve(__dirname, 'tests/mocks/react-router-dom.tsx'),
      },
    },
  },
  // ── shared：共享类型测试 ──
  {
    test: {
      name: 'shared',
      globals: true,
      include: ['packages/shared/**/*.test.ts'],
    },
  },
  // ── chaos：Docker 依赖的混沌工程测试 ──
  {
    test: {
      name: 'chaos',
      globals: true,
      include: ['tests/chaos/**/*.test.ts'],
      exclude: ['tests/**/*.spec.ts'],
      testTimeout: 120000,
      hookTimeout: 60000,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './packages/frontend/src'),
      },
    },
  },
]);

import { defineWorkspace } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * 统一 Vitest 工作区配置（简化版）
 *
 * 3 个项目，按运行环境分组：
 * - node:   后端单元 + 集成 + contract + fuzz + shared（Node 环境，需 backend 依赖）
 * - browser: 前端单元 + 组件 + hooks + store（jsdom 环境，需 frontend 依赖）
 * - chaos:  Docker 依赖的混沌工程测试（长超时）
 *
 * Coverage 在根 test 层共享。
 */

const coverageConfig = {
  provider: 'v8' as const,
  reporter: ['html', 'lcov', 'text', 'json-summary'],
  reportsDirectory: 'coverage/vitest',
  all: true,
  // 分层门控：仅统计 backend 全量 + frontend store/hooks/utils（纯 UI 页面/组件由 E2E 覆盖）
  include: [
    'packages/backend/src/**/*.{ts,tsx}',
    'packages/frontend/src/store/**/*.{ts,tsx}',
    'packages/frontend/src/hooks/**/*.{ts,tsx}',
    'packages/frontend/src/utils/**/*.{ts,tsx}',
  ],
  exclude: [
    'packages/frontend/src/**/*.d.ts',
    'packages/frontend/src/**/*.test.{ts,tsx}',
    'packages/frontend/src/store/index.ts',
    'packages/frontend/src/store/types.ts',
    'packages/backend/src/utils/logger.ts',
    'packages/backend/src/utils/metrics.ts',
    'packages/backend/src/db/import.ts',
    'packages/backend/src/app.ts',
    'packages/backend/src/infrastructure/mailService.ts',
    'packages/backend/src/application/billing/billingService.ts',
  ],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 70,
    statements: 80,
  },
};

export default defineWorkspace([
  // ── node：后端单元 + 集成 + contract + fuzz + shared ──
  {
    test: {
      name: 'node',
      globals: true,
      include: [
        'tests/unit/api/**/*.test.ts',
        'tests/unit/application/**/*.test.ts',
        'tests/unit/config/**/*.test.ts',
        'tests/unit/db/**/*.test.ts',
        'tests/unit/domain/**/*.test.ts',
        'tests/unit/middleware/**/*.test.ts',
        'tests/unit/queues/**/*.test.ts',
        'tests/unit/routes/**/*.test.ts',
        'tests/unit/schemas/**/*.test.ts',
        'tests/unit/services/**/*.test.ts',
        'tests/unit/utils/{date-utils,engine-body-builder,engine-client,errors,http-client,integrity,log-sanitizer,logger,metrics,numeric-range,rate-limiter,request-context,ticker-validation}.test.ts',
        'tests/integration/**/*.test.ts',
        'tests/contract/**/*.test.ts',
        'tests/fuzz/**/*.test.ts',
        'tests/property/**/*.pbt.ts',
        'packages/shared/**/*.test.ts',
      ],
      exclude: ['tests/chaos/**', 'tests/**/*.bench.ts'],
      testTimeout: 30000,
      hookTimeout: 60000,
      deps: {
        moduleDirectories: ['node_modules', 'packages/backend/node_modules'],
      },
      coverage: coverageConfig,
    },
    resolve: {
      alias: {
        // @backtest/shared 别名（与 tsconfig.base.json paths 对齐）
        // 顺序敏感：更具体的子路径必须在通配前缀之前
        '@backtest/shared/types/tactical': path.resolve(
          __dirname,
          'packages/shared/types/tactical.ts',
        ),
        '@backtest/shared/types/signal': path.resolve(__dirname, 'packages/shared/types/signal.ts'),
        '@backtest/shared/types/letf': path.resolve(__dirname, 'packages/shared/types/letf.ts'),
        '@backtest/shared/types/index': path.resolve(__dirname, 'packages/shared/types/index.ts'),
        '@backtest/shared/types': path.resolve(__dirname, 'packages/shared/types/index.ts'),
        '@backtest/shared/constants': path.resolve(__dirname, 'packages/shared/constants.ts'),
        '@backtest/shared': path.resolve(__dirname, 'packages/shared/types/index.ts'),
        // pnpm 严格隔离：后端运行时依赖仅安装在 packages/backend/node_modules，
        // vitest 从 monorepo 根运行时 vite import-analysis 无法向上查找到这些包，
        // 需显式 alias 映射到实际路径，否则 vi.mock 拦截失效。
        express: path.resolve(__dirname, 'packages/backend/node_modules/express'),
        opossum: path.resolve(__dirname, 'packages/backend/node_modules/opossum'),
        pg: path.resolve(__dirname, 'packages/backend/node_modules/pg'),
        jose: path.resolve(__dirname, 'packages/backend/node_modules/jose'),
        argon2: path.resolve(__dirname, 'packages/backend/node_modules/argon2'),
        bullmq: path.resolve(__dirname, 'packages/backend/node_modules/bullmq'),
        zod: path.resolve(__dirname, 'packages/backend/node_modules/zod'),
        stripe: path.resolve(__dirname, 'packages/backend/node_modules/stripe'),
        ioredis: path.resolve(__dirname, 'packages/backend/node_modules/ioredis'),
        'express-rate-limit': path.resolve(
          __dirname,
          'packages/backend/node_modules/express-rate-limit',
        ),
        'rate-limit-redis': path.resolve(
          __dirname,
          'packages/backend/node_modules/rate-limit-redis',
        ),
      },
    },
  },
  // ── browser：前端单元 + 组件 + hooks + store ──
  {
    plugins: [react()],
    test: {
      name: 'browser',
      globals: true,
      include: [
        'tests/unit/store/**/*.test.{ts,tsx}',
        'tests/unit/hooks/**/*.test.{ts,tsx}',
        'tests/unit/components/**/*.test.{ts,tsx}',
        'tests/unit/utils/{admin-stats,api-client,auth-tokens,chart-data-merge,color-scale,config-api,format,portfolio-storage,stats,ticker-presets,url-state}.test.ts',
      ],
      deps: {
        moduleDirectories: ['node_modules', 'packages/frontend/node_modules'],
      },
      environment: 'jsdom',
      coverage: coverageConfig,
    },
    resolve: {
      alias: {
        // pnpm 严格隔离：前端依赖仅安装在 packages/frontend/node_modules，
        // vitest 从 monorepo 根运行时 vite import-analysis 无法向上查找到这些包，
        // 需显式 alias 映射到实际路径（与 vite.config.ts frontendAlias 对齐）。
        // 子路径导出（react/jsx-*）须置于裸包名之前，确保精确匹配优先。
        'react/jsx-dev-runtime': path.resolve(
          __dirname,
          'packages/frontend/node_modules/react/jsx-dev-runtime.js',
        ),
        'react/jsx-runtime': path.resolve(
          __dirname,
          'packages/frontend/node_modules/react/jsx-runtime.js',
        ),
        'react-dom/client': path.resolve(
          __dirname,
          'packages/frontend/node_modules/react-dom/client.js',
        ),
        react: path.resolve(__dirname, 'packages/frontend/node_modules/react'),
        'react-dom': path.resolve(__dirname, 'packages/frontend/node_modules/react-dom'),
        recharts: path.resolve(__dirname, 'packages/frontend/node_modules/recharts'),
        zustand: path.resolve(__dirname, 'packages/frontend/node_modules/zustand'),
        'lucide-react': path.resolve(__dirname, 'packages/frontend/node_modules/lucide-react'),
        i18next: path.resolve(__dirname, 'packages/frontend/node_modules/i18next'),
        'react-i18next': path.resolve(__dirname, 'packages/frontend/node_modules/react-i18next'),
        'i18next-browser-languagedetector': path.resolve(
          __dirname,
          'packages/frontend/node_modules/i18next-browser-languagedetector',
        ),
        '@testing-library/react': path.resolve(
          __dirname,
          'packages/frontend/node_modules/@testing-library/react',
        ),
        '@': path.resolve(__dirname, './packages/frontend/src'),
        // react-router-dom 由测试 mock 覆盖，须置于裸包 alias 之后
        'react-router-dom': path.resolve(__dirname, 'tests/mocks/react-router-dom.tsx'),
      },
    },
  },
  // ── chaos：Docker 依赖的混沌工程测试 ──
  {
    test: {
      name: 'chaos',
      globals: true,
      include: ['tests/chaos/**/*.test.ts'],
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

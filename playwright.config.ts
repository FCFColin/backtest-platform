import { defineConfig, devices } from '@playwright/test';

// 端口单一来源：与 vite.config.ts / packages/backend/src/config/env.ts 对齐。
// baseURL 指向后端 API 端口——E2E 走后端 SERVE_STATIC（FRONTEND_DIST_DIR=dist）
// 托管生产构建前端，验证完整生产链路而非 vite dev。
const API_PORT = process.env.API_PORT ?? '15001';

export default defineConfig({
  testDir: './tests/e2e/ui',
  testMatch: '*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: './tests/e2e/ui/coverage/setup',
  globalTeardown: './tests/e2e/ui/coverage/teardown',
  use: {
    baseURL: `http://localhost:${API_PORT}`,
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
  },
  projects: [
    // 前置认证：注册 + 登录，产出 .auth/user.json（httpOnly refreshToken cookie）
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'firefox',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: '.auth/user.json' },
    },
    {
      name: 'webkit',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: '.auth/user.json' },
    },
  ],
  webServer: {
    command: 'npx tsx packages/backend/src/server.ts',
    url: `http://localhost:${API_PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://backtest:backtest@localhost:5432/backtest',
      API_PORT,
      COMPUTE_RATE_LIMIT_MAX: process.env.COMPUTE_RATE_LIMIT_MAX ?? '200',
      SERVE_STATIC: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    },
  },
});

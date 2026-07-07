import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:5001',
    locale: 'zh-CN',
    viewport: { width: 1280, height: 900 },
    actionTimeout: 10_000,
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npx tsx packages/backend/src/server.ts',
    url: 'http://localhost:5001/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgresql://backtest:backtest@localhost:5432/backtest',
      COMPUTE_RATE_LIMIT_MAX: process.env.COMPUTE_RATE_LIMIT_MAX ?? '200',
      SERVE_STATIC: 'true',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    },
  },
});

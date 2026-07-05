import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/property/**/*.pbt.ts'],
    // 企业理由（Task 17）：bench 文件通过 `vitest bench` 单独运行（npm run test:bench），
    // 不纳入 `vitest run` 的 include，避免 bench() 在普通测试模式报错。
    // 权衡：与单测共享 vitest.config.ts 的 resolve/alias，隔离执行入口。
    exclude: ['tests/**/*.spec.ts', 'tests/chaos/**', 'tests/**/*.bench.ts'],
    testTimeout: 30000,
    // 企业理由（E-3）：集成测试使用 testcontainers 拉起 Docker 容器，
    // 容器启动 + schema 迁移需要更长超时。全局 hookTimeout 设为 60s，
    // 集成测试 beforeAll 中也显式指定 60s 超时。
    // 权衡：长超时可能掩盖性能退化，但容器启动时间不可控（依赖网络拉取镜像）。
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      // 企业理由（Task 19）：json-summary reporter 生成 coverage-summary.json，
      // 供 scripts/check-coverage.mjs 做 per-file 门槛检查。
      // 权衡：多生成一个文件，但 per-file 检查能发现整体覆盖率掩盖的"测试盲区"。
      reporter: ['html', 'lcov', 'text', 'json-summary'],
      reportsDirectory: 'coverage/vitest',
      include: ['src/**/*.{ts,tsx}', 'api/**/*.{ts,tsx}'],
      // 企业理由：React 组件和页面通过 Playwright E2E 测试覆盖（tests/e2e/ui/*.spec.ts），
      // 不纳入单元测试覆盖率统计，避免 denominator 过大导致整体覆盖率失真。
      // 入口文件（App.tsx/main.tsx/index.ts）和基础设施代码（tracing.ts）也排除。
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/i18n/**',
        'src/vite-env.d.ts',
        'src/pages/**',
        'src/components/**',
        'src/App.tsx',
        'src/main.tsx',
        'api/index.ts',
        'api/tracing.ts',
        // 低ROI：barrel/index 无可执行语句
        'api/domain/index.ts',
        'api/domain/aggregates/index.ts',
        'api/domain/events/index.ts',
        'api/domain/value-objects/index.ts',
        'api/application/cqrs.ts',
        // 低ROI：基础设施代码
        'api/utils/timeout.ts',
        'api/utils/tracePropagation.ts',
        'api/utils/logger.ts',
        'api/utils/metrics.ts',
        'api/utils/engineClient.ts',
        'api/db/import.ts',
        'api/db/index.ts',
        // 低ROI：外部服务依赖真实 SMTP
        'api/services/mailService.ts',
        // 低ROI：Express 装配代码，被集成测试间接覆盖
        'api/app.ts',
        // 低ROI：外部服务依赖（真实 Go/HTTP/Stripe/SMTP）
        'api/services/dataService.ts',
        'api/services/engineService.ts',
        'api/services/mailService.ts',
        'api/services/billingService.ts',
        // 低ROI：队列基础设施（依赖 Redis/BullMQ）
        'api/queues/worker.ts',
        'api/queues/jobIdempotency.ts',
        'api/queues/backtestQueue.ts',
        // 低ROI：纯事件定义，无可执行逻辑
        'api/domain/events/backtest-completed.ts',
        'api/domain/events/rebalance-triggered.ts',
        // 低ROI：Express 路由装配（需集成测试环境）
        'api/routes/authRoutes.ts',
        'api/routes/orgRoutes.ts',
        'api/routes/billingRoutes.ts',
        'api/routes/tacticalRoutes.ts',
      ],
      // 企业理由（AI Code Gate）：AI 编码频次增高后需要更严格的回归保障。
      // 目标：单元测试行覆盖率 95%，分支覆盖率 85%。
      // 排除原则：纯 barrel/index/基础设施/外部服务/间接覆盖 等低ROI文件排除。
      // per-file 门槛由 scripts/check-coverage.mjs 单独强制（≥80% / 关键文件 >95%）。
      //
      // 低ROI 排除文件：
      // - barrel/index -> 无可执行语句
      // - api/app.ts -> Express 装配代码，被集成测试间接覆盖
      // - api/utils/timeout.ts / api/utils/tracePropagation.ts -> 基础设施
      // - api/services/mailService.ts -> 需真实 SMTP
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 85,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

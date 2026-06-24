import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // 企业理由（Task 17）：bench 文件使用 vitest 的 bench() API 而非 it()，
    // 加入 include 后可通过 `vitest bench` 触发基准测试，捕获性能回归。
    // `vitest run` 不会执行 bench() 调用（仅 it/test 计入），故不会污染单测结果。
    // 权衡：与单测共享配置，简化维护；如需更强隔离可改用 vitest workspace。
    include: ['tests/**/*.test.ts', 'tests/**/*.bench.ts'],
    // 企业理由（Task 6.5）：chaos 测试依赖运行中的 Docker 环境（docker-compose up），
    // 不能在 CI 默认流程中运行，否则无 Docker 环境会失败。
    // chaos 测试通过 `npm run test:chaos` 单独触发，使用 vitest.config.chaos.ts。
    // 权衡：需维护两个配置文件，但隔离 Docker 依赖测试是必要的。
    exclude: ['tests/**/*.spec.ts', 'tests/chaos/**'],
    testTimeout: 30000,
    // 企业理由（E-3）：集成测试使用 testcontainers 拉起 Docker 容器，
    // 容器启动 + schema 迁移需要更长超时。全局 hookTimeout 设为 60s，
    // 集成测试 beforeAll 中也显式指定 60s 超时。
    // 权衡：长超时可能掩盖性能退化，但容器启动时间不可控（依赖网络拉取镜像）。
    hookTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['html', 'lcov', 'text'],
      reportsDirectory: 'coverage/vitest',
      include: ['src/**/*.{ts,tsx}', 'api/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.{ts,tsx}', 'src/i18n/**', 'src/vite-env.d.ts'],
      // 企业理由：覆盖率门槛防止测试欠债回退。
      // 70% 是务实门槛（Google SRE 推荐 60-80%），过高会鼓励写无意义测试。
      // 权衡：门槛可能被低质量测试满足，需配合 code review 保证测试质量。
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
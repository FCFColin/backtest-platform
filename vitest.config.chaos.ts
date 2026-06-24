/**
 * Chaos 测试专用 vitest 配置（Task 6.5）
 *
 * 企业理由：chaos 测试依赖运行中的 Docker 环境（docker-compose up），
 * 不能与默认 `npm test` 一起运行。主 vitest.config.ts 通过 exclude
 * 排除 tests/chaos/**，本配置取消该排除并仅包含 chaos 测试。
 *
 * 使用方式：npm run test:chaos
 * 权衡：需维护两个配置文件，但隔离 Docker 依赖测试是必要的。
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // 仅包含 chaos 测试
    include: ['tests/chaos/**/*.test.ts'],
    // 不排除 chaos 目录（与主配置相反），仅排除 spec 文件
    exclude: ['tests/**/*.spec.ts'],
    // chaos 测试涉及容器启停和熔断器恢复周期，需要更长超时
    testTimeout: 120000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

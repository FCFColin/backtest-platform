/**
 * Vitest 全局 setup（node 项目）。
 *
 * H-006：authConfig.ts / engineConfig.ts 中的 requireSecret() 会在 env var 缺失时 throw。
 * 部分测试 mock dotenv 导致 .env 不加载，但仍然 import config 模块。
 * 本 setup 在所有测试运行前注入 dev secret，确保 import 不 crash。
 * 测试可通过 delete process.env.XXX + vi.resetModules() 验证 throw 行为。
 */

process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-only-jwt-secret-change-in-production';
process.env.ENGINE_AUTH_TOKEN = process.env.ENGINE_AUTH_TOKEN || 'dev-engine-auth-token';
process.env.DATA_SERVICE_AUTH_TOKEN = process.env.DATA_SERVICE_AUTH_TOKEN || 'dev-data-service-auth-token';
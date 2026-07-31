/**
 * OpenAPI 路径注册入口（BIG2 拆分）
 *
 * 按域拆分为 openapi-paths-{admin,auth,backtest,data}.ts（辅助共享见 openapi-paths-shared.ts），
 * 本文件仅做编排 re-export，保持 openapi-registry.ts 的 import 契约不变。
 */
export { registerAuthPaths } from './openapi-paths-auth.js';
export { registerAdminPaths } from './openapi-paths-admin.js';
export { registerBacktestPaths } from './openapi-paths-backtest.js';
export { registerDataPaths } from './openapi-paths-data.js';

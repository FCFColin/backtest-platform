/**
 * 引擎路由测试共享 mocks 助手
 *
 * 企业理由：12 个测试文件（7 个 routes + 2 个 application + 1 个 queue + 2 个 integration）
 * 重复定义相同的 `EngineUnavailableError` 内联类（~10 行 × 12 处）。本模块集中维护
 * 与生产 `packages/backend/src/utils/engineClient.ts:EngineUnavailableError` 同构的 stub，
 * 使所有测试文件统一 import 该 stub 替代内联定义。
 *
 * vitest 静态语义限制：
 * - vi.hoisted 回调在 import 解析之前运行，不能调用导入的 helper
 * - vi.mock 工厂可以引用 top-level import（如 EngineUnavailableErrorStub），但不能引用闭包变量
 * - 因此 dataServiceMocks/engineMocks 必须在各测试文件中以 vi.hoisted 创建
 *
 * 可复用部分（已在 mockFactories.ts 提供，各测试文件直接调用）：
 *   import { createLoggerMocks } from '../../helpers/mockFactories.js';
 *   vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
 *
 * 不可复用部分（必须留在各测试文件 top-level）：
 *   const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
 *   const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
 *   vi.mock('.../dataService.js', () => ({ fetchHistoryData: dataServiceMocks.fetchHistoryData }));
 *   vi.mock('.../engineClient.js', () => ({
 *     callEngineStrict: engineMocks.callEngineStrict,
 *     EngineUnavailableError: EngineUnavailableErrorStub,
 *   }));
 *
 * 测试中实例化时直接 new：
 *   import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';
 *   engineMocks.callEngineStrict.mockRejectedValueOnce(
 *     new EngineUnavailableErrorStub('/api/engine/backtest'),
 *   );
 */

/**
 * 引擎不可用错误 stub 类
 *
 * 与生产 `packages/backend/src/utils/engineClient.ts:EngineUnavailableError` 同构：
 * - 构造签名 `(endpoint, retryAfterSeconds = 30)` 一致
 * - `retryAfterSeconds`、`code`、`name` 字段一致
 *
 * 替代各测试中重复的内联 `class EngineUnavailableError extends Error {...}`。
 */
export class EngineUnavailableErrorStub extends Error {
  readonly retryAfterSeconds: number;
  readonly code = 'ENGINE_UNAVAILABLE';
  constructor(endpoint: string, retryAfterSeconds = 30) {
    super(`计算引擎暂不可用（${endpoint}），请稍后重试`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

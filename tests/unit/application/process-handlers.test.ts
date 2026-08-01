/**
 * P0-01 单元测试：uncaughtException / unhandledRejection 必须终止进程
 *
 * 企业理由：未终止的 uncaughtException 会导致进程状态不一致（连接池/事件循环可能已损坏），
 * 静默继续运行会引发数据损坏。必须 log + graceful shutdown + exit(1) 让 K8s 重启 Pod。
 *
 * 测试策略：
 *   - mock 所有 server.ts 的重依赖（tracing/app/config/db/outbox/queues/events）
 *   - spy process.exit（mock 为 no-op，不真正退出测试进程）
 *   - 通过 process.emit 触发 uncaughtException / unhandledRejection
 *   - 验证 logger.error 被调用 + process.exit 被调用且退出码为 1
 *   - uncaughtException 的 exit 在异步优雅关闭回调中，需要 await 微任务
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLoggerMocks, mockLogger } from '../../helpers/mockFactories.js';

const loggerMocks = createLoggerMocks();

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/tracing.js', () => ({
  initTracing: vi.fn(),
}));

// Mock app.js — 提供假的 Express app 和 HTTP server
const mockServer = {
  listen: vi.fn((port: number, cb?: () => void) => {
    if (cb) cb();
    return mockServer;
  }),
  on: vi.fn(),
  close: vi.fn((cb?: () => void) => {
    if (cb) cb();
    return mockServer;
  }),
};

vi.mock('../../../packages/backend/src/app.js', () => ({
  default: vi.fn(),
  server: mockServer,
}));

vi.mock('../../../packages/backend/src/config/env.js', () => ({
  config: { API_PORT: 5001, NODE_ENV: 'test' },
  requireSecret: vi.fn(),
  parseCorsOrigins: vi.fn(),
  resolveJwtAlgorithm: vi.fn(),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../packages/backend/src/infrastructure/platformAdminBootstrap.js', () => ({
  bootstrapPlatformAdminKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../packages/backend/src/infrastructure/apiKeyMonitoring.js', () => ({
  startApiKeyMonitoring: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(),
  getReadPool: vi.fn(),
  closeDb: vi.fn().mockResolvedValue(undefined),
}));

const mockOutboxConsumer = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
};

vi.mock('../../../packages/backend/src/infrastructure/outboxPublisher.js', () => ({
  createOutboxConsumer: vi.fn(() => mockOutboxConsumer),
  setWebhookHandler: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/metrics.js', () => ({
  registerTimescaleMetrics: vi.fn(),
}));

vi.mock('../../../packages/backend/src/domain/events/events.js', () => ({
  eventDispatcher: { register: vi.fn() },
  RUN_COMPLETED_EVENT: 'RunCompleted',
  RUN_STARTED_EVENT: 'RunStarted',
  RUN_FAILED_EVENT: 'RunFailed',
  RUN_CANCELLED_EVENT: 'RunCancelled',
  RUN_AGGREGATE_TYPE: 'Run',
  DomainEventDispatcher: vi.fn(),
}));

vi.mock('../../../packages/backend/src/application/completedHandlers.js', () => ({
  BacktestCompletedHandler: vi.fn().mockImplementation(() => ({})),
  RunCompletedHandler: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../../packages/backend/src/application/webhookService.js', () => ({
  triggerWebhooks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../packages/backend/src/queues/queueDefinitions.js', () => ({
  createWebhookRetryWorker: vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
  scheduleWebhookRetryJob: vi.fn().mockResolvedValue(undefined),
}));

describe('P0-01: uncaughtException / unhandledRejection 必须终止进程', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    vi.clearAllMocks();
    // 重置模块缓存，使 server.ts 的模块级 shuttingDown 标志重置
    vi.resetModules();
    originalExit = process.exit;
    // process.exit 替换为 no-op spy，不真正退出测试进程
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      // no-op: 阻止真实退出
      return undefined as never;
    });
  });

  afterEach(() => {
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  it('unhandledRejection 触发后应同步调用 process.exit(1)', async () => {
    // 动态导入 server.ts（触发模块级副作用：注册 process handlers）
    await import('../../../packages/backend/src/server.js');

    // 等待 listen 回调中的异步操作完成
    await new Promise((resolve) => setTimeout(resolve, 100));

    loggerMocks.error.mockClear();
    exitSpy.mockClear();

    // 模拟 unhandledRejection — 同步 exit(1)
    const reason = new Error('test unhandled rejection');
    process.emit('unhandledRejection', reason);

    // 验证 logger.error 被调用（记录错误信息）
    expect(loggerMocks.error).toHaveBeenCalled();
    // 验证 process.exit 被调用且退出码为 1
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uncaughtException 触发后应通过优雅关闭最终调用 process.exit(1)', async () => {
    // 动态导入 server.ts
    await import('../../../packages/backend/src/server.js');

    await new Promise((resolve) => setTimeout(resolve, 100));

    loggerMocks.error.mockClear();
    exitSpy.mockClear();

    // 模拟 uncaughtException — triggerShutdown → server.close(async cb) → process.exit(1)
    const err = new Error('test uncaught exception');
    process.emit('uncaughtException', err);

    // server.close 的回调是 async，需等待微任务完成
    // closeDb/outbox.stop 等 mock 均 resolve 立即完成，await 后即调 process.exit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 验证 logger.error 被调用
    expect(loggerMocks.error).toHaveBeenCalled();
    // 验证 process.exit 被调用且退出码为 1
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('重复触发 uncaughtException 不应多次调用 exit（幂等保护）', async () => {
    // 每个测试通过 vi.resetModules() 获取全新模块实例，shuttingDown 初始为 false
    await import('../../../packages/backend/src/server.js');

    await new Promise((resolve) => setTimeout(resolve, 100));

    exitSpy.mockClear();

    // 第一次 uncaughtException 触发 shutdown + exit(1)
    process.emit('uncaughtException', new Error('first'));
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 第一次调用 exit(1)
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);

    // 第二次触发应被忽略（shuttingDown = true）
    process.emit('uncaughtException', new Error('second'));
    await new Promise((resolve) => setTimeout(resolve, 100));

    // exit 仍只被调用一次
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });
});

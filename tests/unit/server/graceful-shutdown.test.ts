/**
 * 优雅关闭单元测试（Task 5.4）
 *
 * 企业理由：SIGTERM 优雅关闭是容器化部署的必需能力，
 * 关闭流程错误会导致在途请求丢失或数据库连接泄漏。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLoggerMocks, createConfigMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

const mocks = vi.hoisted(() => {
  const mockServerClose = vi.fn((cb?: () => void) => {
    if (cb) cb();
  });
  const mockServer = {
    on: vi.fn(),
    close: mockServerClose,
  };
  const mockCloseDb = vi.fn().mockResolvedValue(undefined);
  const mockInitDb = vi.fn().mockResolvedValue(undefined);
  const mockOutboxPublisher = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const mockGetPool = vi.fn(() => ({ query: vi.fn() }));
  return {
    mockServer,
    mockServerClose,
    mockCloseDb,
    mockInitDb,
    mockOutboxPublisher,
    mockGetPool,
  };
});

vi.mock('../../../packages/backend/src/tracing.js', () => ({
  initTracing: vi.fn(),
}));

vi.mock('../../../packages/backend/src/app.js', () => ({
  default: {
    listen: vi.fn((_port: number, cb?: () => void) => {
      if (cb) {
        Promise.resolve().then(() => cb());
      }
      return mocks.mockServer;
    }),
  },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ API_PORT: 3000, NODE_ENV: 'test' }),
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  initDb: mocks.mockInitDb,
}));

vi.mock('../../../packages/backend/src/db/index.js', () => ({
  closeDb: mocks.mockCloseDb,
  getPool: mocks.mockGetPool,
}));

vi.mock('../../../packages/backend/src/services/outboxPublisher.js', () => ({
  OutboxPublisher: vi.fn(() => mocks.mockOutboxPublisher),
}));

vi.mock('../../../packages/backend/src/domain/events/index.js', () => ({
  eventDispatcher: { register: vi.fn() },
  BacktestCompletedHandler: vi.fn(),
  RebalanceTriggeredHandler: vi.fn(),
}));

describe('Graceful Shutdown (Task 5)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('setupGracefulShutdown 应注册 SIGTERM 和 SIGINT 信号处理器', async () => {
    const onSpy = vi.spyOn(process, 'on');
    await import('../../../packages/backend/src/server.js');
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    onSpy.mockRestore();
  });

  it('收到 SIGTERM 时应调用 server.close()', async () => {
    await import('../../../packages/backend/src/server.js');

    process.emit('SIGTERM');

    expect(mocks.mockServerClose).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(mocks.mockCloseDb).toHaveBeenCalledTimes(1);
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('shuttingDown 标志位应防止多次触发', async () => {
    await import('../../../packages/backend/src/server.js');

    process.emit('SIGTERM');
    process.emit('SIGTERM');
    process.emit('SIGINT');

    expect(mocks.mockServerClose).toHaveBeenCalledTimes(1);
  });

  it('收到 SIGINT 时也应触发优雅关闭', async () => {
    await import('../../../packages/backend/src/server.js');

    process.emit('SIGINT');

    expect(mocks.mockServerClose).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(mocks.mockCloseDb).toHaveBeenCalledTimes(1);
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('listen 回调应初始化 DB 与 OutboxPublisher', async () => {
    await import('../../../packages/backend/src/server.js');

    await vi.waitFor(() => {
      expect(mocks.mockInitDb).toHaveBeenCalled();
    });
    expect(mocks.mockOutboxPublisher.start).toHaveBeenCalled();
  });

  it('端口占用 (EADDRINUSE) 应记录错误并 exit(1)', async () => {
    mocks.mockServer.on.mockImplementation(
      (event: string, handler: (err: NodeJS.ErrnoException) => void) => {
        if (event === 'error') {
          handler(Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' }));
        }
      },
    );

    await import('../../../packages/backend/src/server.js');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('initDb 失败时不应阻塞服务启动', async () => {
    mocks.mockInitDb.mockRejectedValueOnce(new Error('schema failed'));
    await import('../../../packages/backend/src/server.js');
    await vi.waitFor(() => expect(mocks.mockInitDb).toHaveBeenCalled());
    expect(mocks.mockOutboxPublisher.start).toHaveBeenCalled();
  });
});

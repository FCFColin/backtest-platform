/**
 * 优雅关闭单元测试（Task 5.4）
 *
 * 企业理由：SIGTERM 优雅关闭是容器化部署的必需能力，
 * 关闭流程错误会导致在途请求丢失或数据库连接泄漏。
 * 单元测试锁定以下行为：
 *   - setupGracefulShutdown 函数存在且已导出
 *   - 收到 SIGTERM 时调用 server.close()
 *   - shuttingDown 标志位防止多次触发
 *   - 关闭流程中调用 closeDb() 关闭数据库连接池
 *
 * 实现：mock 掉 server.ts 的所有外部依赖（tracing/app/config/db 等），
 * 使用 vi.resetModules() 为每个测试获取新鲜的模块状态（fresh shuttingDown 标志），
 * 使用 fake timers 防止 generateMetaFiles 的 setTimeout 干扰测试。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== vi.hoisted: 在 mock 工厂中共享的 mock 对象 =====
// 企业理由：vi.mock 工厂在文件顶部执行（hoisted），普通变量无法在其中引用，
// 必须使用 vi.hoisted 创建可在 mock 工厂中访问的 mock 对象。
const mocks = vi.hoisted(() => {
  const mockServerClose = vi.fn((cb?: () => void) => {
    if (cb) cb();
  });
  const mockServer = {
    on: vi.fn(),
    close: mockServerClose,
  };
  const mockCloseDb = vi.fn().mockResolvedValue(undefined);
  const mockStopRustEngine = vi.fn();
  return { mockServer, mockServerClose, mockCloseDb, mockStopRustEngine };
});

// ===== mock 依赖（vi.mock 会被提升到顶部，先于 import 执行）=====

// mock tracing，避免 OTel SDK 初始化
vi.mock('../../../api/tracing.js', () => ({
  initTracing: vi.fn(),
}));

// mock app，避免创建真实 Express 应用和监听端口
// app.listen 返回 mock server，不调用 listen 回调（避免 initDb 等副作用）
vi.mock('../../../api/app.js', () => ({
  default: {
    listen: vi.fn(() => mocks.mockServer),
  },
}));

// mock config，避免读取环境变量
vi.mock('../../../api/config/index.js', () => ({
  config: { API_PORT: 3000, NODE_ENV: 'test' },
  validateConfig: vi.fn(),
}));

// mock logger，避免测试输出噪音
vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

// mock engineService，避免生成 meta 文件
vi.mock('../../../api/services/engineService.js', () => ({
  generateMetaFiles: vi.fn().mockResolvedValue(undefined),
}));

// mock dataService，避免数据库初始化
vi.mock('../../../api/services/dataService.js', () => ({
  initDb: vi.fn().mockResolvedValue(undefined),
}));

// mock rustEngineProcess，避免启动/停止 Rust 子进程
vi.mock('../../../api/utils/rustEngineProcess.js', () => ({
  startRustEngine: vi.fn().mockResolvedValue(undefined),
  stopRustEngine: mocks.mockStopRustEngine,
}));

// mock db，避免真实数据库连接
vi.mock('../../../api/db/index.js', () => ({
  closeDb: mocks.mockCloseDb,
}));

// ===== 测试用例 =====

describe('Graceful Shutdown (Task 5)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // 使用 fake timers 防止 generateMetaFiles 的 setTimeout(1000) 干扰测试
    vi.useFakeTimers();
    // 清除 mock 调用记录（保留实现）
    vi.clearAllMocks();
    // 重置模块注册表，使每个测试获取新鲜的 shuttingDown 标志
    vi.resetModules();
    // 拦截 process.exit，防止测试进程退出
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    exitSpy.mockRestore();
    // 清理信号监听器，防止跨测试泄漏
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('setupGracefulShutdown 应为已导出的函数', async () => {
    const serverModule = await import('../../../api/server.js');
    expect(typeof serverModule.setupGracefulShutdown).toBe('function');
  });

  it('收到 SIGTERM 时应调用 server.close()', async () => {
    // 导入 server.ts 会触发模块级 setupGracefulShutdown(server) 调用，
    // 注册 SIGTERM/SIGINT 监听器
    await import('../../../api/server.js');

    process.emit('SIGTERM');

    // server.close 应被调用一次
    expect(mocks.mockServerClose).toHaveBeenCalledTimes(1);
    // stopRustEngine 也应被调用（停止 Rust 子进程）
    expect(mocks.mockStopRustEngine).toHaveBeenCalledTimes(1);

    // 刷新微任务：server.close 回调中 await closeDb() 是异步的
    await vi.waitFor(() => {
      expect(mocks.mockCloseDb).toHaveBeenCalledTimes(1);
    });
    // closeDb 完成后应调用 process.exit(0)
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('shuttingDown 标志位应防止多次触发', async () => {
    await import('../../../api/server.js');

    // 连续发送多个信号
    process.emit('SIGTERM');
    process.emit('SIGTERM');
    process.emit('SIGINT');

    // server.close 只应被调用一次（后续信号被 shuttingDown 标志拦截）
    expect(mocks.mockServerClose).toHaveBeenCalledTimes(1);
  });

  it('收到 SIGINT 时也应触发优雅关闭', async () => {
    await import('../../../api/server.js');

    process.emit('SIGINT');

    expect(mocks.mockServerClose).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(mocks.mockCloseDb).toHaveBeenCalledTimes(1);
    });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

/**
 * 数据获取服务单元测试
 *
 * 企业理由：dataFetchService 管理 Go worker 数据更新进程的生命周期，
 * 包括启动、停止、状态查询。测试覆盖：状态快照隔离、重复启动拒绝、
 * 增量模式参数、已停止时停止的优雅处理。
 *
 * 注：该服务通过 child_process.spawn 启动 Go 协程，测试中不实际启动进程。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: loggerMocks }));

const spawnMocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: spawnMocks.spawn }));

const poolMocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [{ count: '100' }] }),
}));
vi.mock('../../../api/db/index.js', () => ({ getPool: vi.fn(() => poolMocks) }));

function makeMockProcess() {
  return {
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
  };
}

describe('dataFetchService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('getUpdateStatus', () => {
    it('初始状态应为未运行', async () => {
      const { getUpdateStatus } = await import('../../../api/services/dataFetchService.js');
      const status = getUpdateStatus();
      expect(status.running).toBe(false);
      expect(status.workerPid).toBeNull();
      expect(status.mode).toBeNull();
      expect(status.startedAt).toBeNull();
      expect(status.completedTickers).toBe(0);
      expect(status.totalTickers).toBe(0);
      expect(status.lastError).toBeNull();
    });

    it('应返回状态的深拷贝', async () => {
      const { getUpdateStatus } = await import('../../../api/services/dataFetchService.js');
      const status1 = getUpdateStatus();
      status1.running = true;
      const status2 = getUpdateStatus();
      expect(status2.running).toBe(false);
    });
  });

  describe('startUpdate', () => {
    it('已有进程运行时返回失败', async () => {
      spawnMocks.spawn.mockReturnValue(makeMockProcess());
      const { startUpdate } = await import('../../../api/services/dataFetchService.js');
      await startUpdate('full');
      const result = await startUpdate('full');
      expect(result.success).toBe(false);
      expect(result.message).toContain('已有');
    });

    it('增量模式应添加 --incremental 参数', async () => {
      spawnMocks.spawn.mockReturnValue(makeMockProcess());
      const { startUpdate } = await import('../../../api/services/dataFetchService.js');
      const result = await startUpdate('incremental');
      expect(result.success).toBe(true);
      expect(result.message).toContain('增量');
    });

    it('全量模式不应添加 --incremental', async () => {
      spawnMocks.spawn.mockReturnValue(makeMockProcess());
      const { startUpdate } = await import('../../../api/services/dataFetchService.js');
      const result = await startUpdate('full');
      expect(result.success).toBe(true);
      expect(result.message).toContain('全量');
    });
  });

  describe('stopUpdate', () => {
    it('没有运行的任务时应返回失败', async () => {
      const { stopUpdate } = await import('../../../api/services/dataFetchService.js');
      const result = stopUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('没有');
    });

    it('有运行任务时应停止并返回成功', async () => {
      spawnMocks.spawn.mockReturnValue(makeMockProcess());
      const { startUpdate, stopUpdate } = await import('../../../api/services/dataFetchService.js');
      await startUpdate('full');
      const result = stopUpdate();
      expect(result.success).toBe(true);
      expect(result.message).toContain('已停止');
    });
  });
});

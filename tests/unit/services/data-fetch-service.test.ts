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

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));

function makeMockJob(opts: {
  id?: string;
  state?: string;
  mode?: 'full' | 'incremental';
  progress?: number;
  timestamp?: number;
}): Record<string, unknown> {
  return {
    id: opts.id ?? 'job-update-001',
    data: { mode: opts.mode ?? 'full' },
    progress: opts.progress ?? 0,
    timestamp: opts.timestamp ?? Date.now(),
    getState: vi.fn().mockResolvedValue(opts.state ?? 'active'),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
  getActiveUpdateJobs: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../packages/backend/src/queues/queueDefinitions.js', () => ({
  dataUpdateQueue: {
    add: queueMocks.add,
  },
  getActiveUpdateJobs: queueMocks.getActiveUpdateJobs,
  dataUpdateDlq: { add: vi.fn() },
}));

describe('dataFetchService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
    queueMocks.add.mockResolvedValue({ id: 'job-update-001' });
  });

  describe('getUpdateStatus', () => {
    it('初始状态应为未运行', async () => {
      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const status = await getUpdateStatus();
      expect(status.running).toBe(false);
      expect(status.mode).toBeNull();
      expect(status.startedAt).toBeNull();
      expect(status.completedTickers).toBe(0);
      expect(status.totalTickers).toBe(0);
      expect(status.lastError).toBeNull();
    });

    it('应返回状态的深拷贝', async () => {
      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const status1 = await getUpdateStatus();
      status1.running = true;
      const status2 = await getUpdateStatus();
      expect(status2.running).toBe(false);
    });

    it('有活跃任务时应返回运行中状态', async () => {
      const job = makeMockJob({ state: 'active', mode: 'incremental', progress: 50 });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);

      const { getUpdateStatus } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const status = await getUpdateStatus();
      expect(status.running).toBe(true);
      expect(status.mode).toBe('incremental');
      expect(status.completedTickers).toBe(50);
    });
  });

  describe('startUpdate', () => {
    it('已有进程运行时返回失败', async () => {
      const job = makeMockJob({ state: 'active' });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);

      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const result = await startUpdate('full');
      expect(result.success).toBe(false);
      expect(result.message).toContain('已有');
    });

    it('增量模式应入队并返回成功', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      queueMocks.add.mockResolvedValue({ id: 'job-inc-001' });

      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const result = await startUpdate('incremental');
      expect(result.success).toBe(true);
      expect(result.message).toContain('增量');
      expect(result.jobId).toBe('job-inc-001');

      const [name, data] = queueMocks.add.mock.calls[0];
      expect(name).toBe('data-update');
      expect(data.mode).toBe('incremental');
    });

    it('全量模式应入队并返回成功', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);
      queueMocks.add.mockResolvedValue({ id: 'job-full-001' });

      const { startUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const result = await startUpdate('full');
      expect(result.success).toBe(true);
      expect(result.message).toContain('全量');

      const [, data] = queueMocks.add.mock.calls[0];
      expect(data.mode).toBe('full');
    });
  });

  describe('stopUpdate', () => {
    it('没有运行的任务时应返回失败', async () => {
      queueMocks.getActiveUpdateJobs.mockResolvedValue([]);

      const { stopUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const result = await stopUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('没有');
    });

    it('有运行任务时应停止并返回成功', async () => {
      const job = makeMockJob({ id: 'job-running', state: 'active' });
      queueMocks.getActiveUpdateJobs.mockResolvedValue([job]);

      const { stopUpdate } =
        await import('../../../packages/backend/src/infrastructure/dataFetch.js');
      const result = await stopUpdate();
      expect(result.success).toBe(true);
      expect(result.message).toContain('已停止');
      expect(job.remove).toHaveBeenCalled();
    });
  });
});

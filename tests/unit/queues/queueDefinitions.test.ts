import { describe, it, expect, vi } from 'vitest';

const { loggerMocks, queueMocks, workerMocks } = vi.hoisted(() => {
  const queueInstances: Record<string, unknown> = {};
  const workerInstances: Record<string, unknown> = {};
  const loggerMocks = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  };
  return {
    loggerMocks,
    queueMocks: {
      instances: queueInstances,
      Queue: vi.fn().mockImplementation((name: string) => {
        const inst = {
          name,
          on: vi.fn(),
          add: vi.fn().mockResolvedValue({ id: 'job-1' }),
          getJobs: vi.fn().mockResolvedValue([]),
          close: vi.fn().mockResolvedValue(undefined),
        };
        queueInstances[name] = inst;
        return inst;
      }),
    },
    workerMocks: {
      instances: workerInstances,
      Worker: vi.fn().mockImplementation((name: string, fn: unknown) => {
        const inst = { name, fn, on: vi.fn(), close: vi.fn().mockResolvedValue(undefined) };
        workerInstances[name] = inst;
        return inst;
      }),
    },
  };
});

vi.mock('bullmq', () => ({ Queue: queueMocks.Queue, Worker: workerMocks.Worker }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  bullmqConnectionOptions: { host: 'localhost', port: 6379 },
  isSentinelMode: false,
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
vi.mock('../../../packages/backend/src/application/auditExporter.js', () => ({
  exportPendingAuditLogs: vi.fn().mockResolvedValue({ exported: 0 }),
}));
vi.mock('../../../packages/backend/src/application/webhookService.js', () => ({
  processPendingDeliveries: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../packages/backend/src/queues/queueUtils.js', () => ({
  createDeadLetterQueue: vi.fn().mockReturnValue({ name: 'dlq', add: vi.fn() }),
  SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS: 86400,
  isFinalFailure: vi.fn(() => false),
  transferToDlq: vi.fn(),
  startHeartbeat: vi.fn().mockReturnValue(null),
}));

import {
  dataUpdateQueue,
  auditExportQueue,
  webhookQueue,
  getActiveUpdateJobs,
  scheduleAuditExportJob,
  createAuditExportWorker,
  scheduleWebhookRetryJob,
  createWebhookRetryWorker,
} from '../../../packages/backend/src/queues/queueDefinitions.js';

// NOTE: 不使用 vi.clearAllMocks()，因为 Queue/Worker 实例在模块加载时创建，
// clearAllMocks 会清除 on('error') 等初始化调用的记录。

describe('Queue 实例创建', () => {
  it('dataUpdateQueue 应使用正确的默认配置', () => {
    expect(dataUpdateQueue.name).toBe('data-update');
    expect(dataUpdateQueue.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('auditExportQueue 应使用正确的名称', () => {
    expect(auditExportQueue.name).toBe('audit-export');
  });

  it('webhookQueue 应使用正确的名称', () => {
    expect(webhookQueue.name).toBe('webhook-retry');
  });
});

describe('getActiveUpdateJobs', () => {
  it('应返回 active/waiting/delayed 任务', async () => {
    dataUpdateQueue.getJobs = vi.fn().mockResolvedValue([{ id: 'j1' }, { id: 'j2' }]);
    const result = await getActiveUpdateJobs();
    expect(result).toHaveLength(2);
    expect(dataUpdateQueue.getJobs).toHaveBeenCalledWith(['active', 'waiting', 'delayed'], 0, 10);
  });
});

describe('scheduleAuditExportJob', () => {
  it('应添加重复任务', async () => {
    auditExportQueue.add = vi.fn().mockResolvedValue({ id: 'job-audit' });
    await scheduleAuditExportJob();
    expect(auditExportQueue.add).toHaveBeenCalledWith(
      'audit-export',
      {},
      expect.objectContaining({ jobId: 'audit-export-cron', repeat: { every: 300000 } }),
    );
  });
});

describe('createAuditExportWorker', () => {
  it('应创建 Worker 并注册 error 事件', () => {
    const worker = createAuditExportWorker();
    expect(workerMocks.Worker).toHaveBeenCalledWith(
      'audit-export',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
    expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('Worker 处理函数应调用 exportPendingAuditLogs', async () => {
    const { exportPendingAuditLogs } =
      await import('../../../packages/backend/src/application/auditExporter.js');
    createAuditExportWorker();
    const fn = workerMocks.instances['audit-export'].fn as () => Promise<void>;
    await fn();
    expect(exportPendingAuditLogs).toHaveBeenCalled();
  });

  it('Worker 处理函数异常时不抛出', async () => {
    const { exportPendingAuditLogs } =
      await import('../../../packages/backend/src/application/auditExporter.js');
    (exportPendingAuditLogs as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    createAuditExportWorker();
    const fn = workerMocks.instances['audit-export'].fn as () => Promise<void>;
    await expect(fn()).resolves.toBeUndefined();
  });
});

describe('scheduleWebhookRetryJob', () => {
  it('应添加重复任务', async () => {
    webhookQueue.add = vi.fn().mockResolvedValue({ id: 'job-wh' });
    await scheduleWebhookRetryJob();
    expect(webhookQueue.add).toHaveBeenCalledWith(
      'webhook-retry',
      {},
      expect.objectContaining({ jobId: 'webhook-retry-cron', repeat: { every: 60000 } }),
    );
  });
});

describe('createWebhookRetryWorker', () => {
  it('应创建 Worker 并注册 error/failed 事件', () => {
    const worker = createWebhookRetryWorker();
    expect(workerMocks.Worker).toHaveBeenCalledWith(
      'webhook-retry',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 }),
    );
    expect(worker.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith('failed', expect.any(Function));
  });

  it('Worker 处理函数应调用 processPendingDeliveries', async () => {
    const { processPendingDeliveries } =
      await import('../../../packages/backend/src/application/webhookService.js');
    createWebhookRetryWorker();
    const fn = workerMocks.instances['webhook-retry'].fn as () => Promise<void>;
    await fn();
    expect(processPendingDeliveries).toHaveBeenCalled();
  });
});

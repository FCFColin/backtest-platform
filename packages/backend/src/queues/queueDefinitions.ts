/**
 * 队列定义：数据更新、审计导出、Webhook 重试。
 *
 * 合并 dataUpdateQueue / auditExportQueue / webhookQueue 消除重复的 Redis 连接配置与日志模式。
 */

import { Queue, Worker } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { buildRedisBaseOptions, isSentinelMode } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { exportPendingAuditLogs } from '../application/auditExporter.js';
import { processPendingDeliveries } from '../application/webhookService.js';
import {
  createDeadLetterQueue,
  SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS,
  isFinalFailure,
  transferToDlq,
} from './queueUtils.js';

const connectionOptions: RedisOptions = {
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

logger.info(
  { module: 'queueDefinitions', mode: isSentinelMode ? 'sentinel' : 'standalone' },
  'BullMQ queue connection configured',
);

// ── Data Update Queue ──────────────────────────────────────────────────────

export interface DataUpdateJobData {
  mode: 'full' | 'incremental';
  triggeredBy?: string;
}

export interface DataUpdateJobResult {
  status: 'completed' | 'failed';
  totalTickers: number;
  completedTickers: number;
  failedTickers: string[];
  error?: string;
}

const DATA_UPDATE_QUEUE = 'data-update';

export const dataUpdateQueue = new Queue<DataUpdateJobData, DataUpdateJobResult>(
  DATA_UPDATE_QUEUE,
  {
    connection: connectionOptions,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { count: 10 },
      removeOnFail: { age: SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS },
    },
  },
);

export const dataUpdateDlq = createDeadLetterQueue(DATA_UPDATE_QUEUE);

dataUpdateQueue.on('error', (err) => {
  logger.error({ module: 'dataUpdateQueue', err: err.message }, 'BullMQ data-update queue error');
});

export async function getActiveUpdateJobs() {
  return dataUpdateQueue.getJobs(['active', 'waiting', 'delayed'], 0, 10);
}

// ── Audit Export Queue ─────────────────────────────────────────────────────

const AUDIT_EXPORT_QUEUE = 'audit-export';
const AUDIT_EXPORT_JOB_ID = 'audit-export-cron';
const AUDIT_REPEAT_INTERVAL_MS = 5 * 60_000;

export const auditExportQueue = new Queue(AUDIT_EXPORT_QUEUE, {
  connection: connectionOptions,
  defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
});

auditExportQueue.on('error', (err) => {
  logger.error(
    { module: 'auditExportQueue', err: err.message },
    'Audit export queue connection error',
  );
});

export async function scheduleAuditExportJob(): Promise<void> {
  await auditExportQueue.add(
    'audit-export',
    {},
    { repeat: { every: AUDIT_REPEAT_INTERVAL_MS }, jobId: AUDIT_EXPORT_JOB_ID },
  );
  logger.info(
    { module: 'auditExportQueue', intervalMs: AUDIT_REPEAT_INTERVAL_MS },
    'Audit export job scheduled (every 5 minutes)',
  );
}

export function createAuditExportWorker(): Worker {
  const worker = new Worker(
    AUDIT_EXPORT_QUEUE,
    async () => {
      try {
        const result = await exportPendingAuditLogs();
        logger.debug({ module: 'auditExportQueue', ...result }, 'Audit export tick completed');
      } catch (err) {
        logger.error(
          { module: 'auditExportQueue', err: (err as Error).message },
          'Audit export failed (will retry next tick)',
        );
      }
    },
    { connection: connectionOptions, concurrency: 1 },
  );
  worker.on('error', (err) => {
    logger.error({ module: 'auditExportQueue', err: err.message }, 'Audit export worker error');
  });
  logger.info(
    { module: 'auditExportQueue', mode: isSentinelMode ? 'sentinel' : 'standalone' },
    'Audit export worker created',
  );
  return worker;
}

// ── Webhook Retry Queue ────────────────────────────────────────────────────

const WEBHOOK_QUEUE = 'webhook-retry';
const WEBHOOK_JOB_ID = 'webhook-retry-cron';
const WEBHOOK_REPEAT_INTERVAL_MS = 60_000;

export const webhookQueue = new Queue(WEBHOOK_QUEUE, {
  connection: connectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { age: SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS },
  },
});

const webhookDlq = createDeadLetterQueue(WEBHOOK_QUEUE);

webhookQueue.on('error', (err) => {
  logger.error({ module: 'webhookQueue', err: err.message }, 'Webhook Queue connection error');
});

export async function scheduleWebhookRetryJob(): Promise<void> {
  await webhookQueue.add(
    'webhook-retry',
    {},
    { repeat: { every: WEBHOOK_REPEAT_INTERVAL_MS }, jobId: WEBHOOK_JOB_ID },
  );
  logger.info(
    { module: 'webhookQueue', intervalMs: WEBHOOK_REPEAT_INTERVAL_MS },
    'Webhook retry job scheduled (every 1 minute)',
  );
}

export function createWebhookRetryWorker(): Worker {
  const worker = new Worker(
    WEBHOOK_QUEUE,
    async () => {
      try {
        await processPendingDeliveries();
      } catch (err) {
        logger.error(
          { module: 'webhookQueue', err: (err as Error).message },
          'Webhook retry processing failed (will retry next tick)',
        );
      }
    },
    { connection: connectionOptions, concurrency: 1 },
  );
  worker.on('error', (err) => {
    logger.error({ module: 'webhookQueue', err: err.message }, 'Webhook retry worker error');
  });
  worker.on('failed', (job, err) => {
    logger.error(
      {
        module: 'webhookQueue',
        jobId: job?.id,
        error: err.message,
        attemptsMade: job?.attemptsMade,
      },
      'Webhook retry job failed',
    );
    if (job && isFinalFailure(job)) {
      void transferToDlq(webhookDlq, WEBHOOK_QUEUE, job, err);
    }
  });
  logger.info({ module: 'webhookQueue' }, 'Webhook retry worker created');
  return worker;
}

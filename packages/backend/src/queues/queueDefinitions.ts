import { Queue, Worker } from 'bullmq';
import { bullmqConnectionOptions, isSentinelMode } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { exportPendingAuditLogs } from '../application/auditExporter.js';
import { createDeadLetterQueue, SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS } from './queueUtils.js';
import { createQueueWorker } from './workerFactory.js';

logger.info(
  { module: 'queueDefinitions', mode: isSentinelMode ? 'sentinel' : 'standalone' },
  'BullMQ queue connection configured',
);

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

export const DATA_UPDATE_QUEUE = 'data-update';
export const dataUpdateQueue = new Queue<DataUpdateJobData, DataUpdateJobResult>(
  DATA_UPDATE_QUEUE,
  {
    connection: bullmqConnectionOptions,
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

const AUDIT_EXPORT_QUEUE = 'audit-export';
const AUDIT_EXPORT_JOB_ID = 'audit-export-cron';
const AUDIT_REPEAT_INTERVAL_MS = 5 * 60_000;

export const auditExportQueue = new Queue(AUDIT_EXPORT_QUEUE, {
  connection: bullmqConnectionOptions,
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
  const worker = createQueueWorker(
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
    { concurrency: 1 },
  );
  logger.info(
    { module: 'auditExportQueue', mode: isSentinelMode ? 'sentinel' : 'standalone' },
    'Audit export worker created',
  );
  return worker;
}

/**
 * 审计日志导出队列（P2-03 不可篡改审计存储）
 *
 * Architecture: BullMQ 重复任务，每 5 分钟将 DB 中未导出审计日志上传至 MinIO WORM。
 * 与 webhookQueue 同模式：固定 jobId 防重复注册；worker 在独立 Worker 进程运行。
 *
 * 企业理由：WORM 导出是等保合规承诺（不可篡改审计存储），此前 exportPendingAuditLogs
 * 已实现并有测试但无调度方——本队列补齐调度。MinIO 未配置时导出作业内部 fail-closed
 * （见 auditExporter.ts），队列侧无需额外判断。
 */
import { Queue, Worker } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { buildRedisBaseOptions, isSentinelMode } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { exportPendingAuditLogs } from '../application/auditExporter.js';

const QUEUE_NAME = 'audit-export';
const JOB_ID = 'audit-export-cron';
const REPEAT_INTERVAL_MS = 5 * 60_000;

const connectionOptions: RedisOptions = {
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export const auditExportQueue = new Queue(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

auditExportQueue.on('error', (err) => {
  logger.error(
    { module: 'auditExportQueue', err: err.message },
    'Audit export queue connection error',
  );
});

/**
 * 调度审计导出重复任务（每 5 分钟一次）。
 *
 * 固定 jobId 保证重复注册幂等；worker 崩溃重启后 BullMQ 自动恢复调度。
 */
export async function scheduleAuditExportJob(): Promise<void> {
  await auditExportQueue.add(
    'audit-export',
    {},
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: JOB_ID },
  );
  logger.info(
    { module: 'auditExportQueue', intervalMs: REPEAT_INTERVAL_MS },
    'Audit export job scheduled (every 5 minutes)',
  );
}

/**
 * 创建审计导出 Worker。
 *
 * 并发度 1：单批 100 条上限 + 每 5 分钟一次，单实例足够；多实例时 MinIO 侧需
 * 幂等（对象 key 含随机 batchId，同日多次导出不冲突；exported_at 回填防止重复导出）。
 *
 * @returns BullMQ Worker 实例（调用方负责在关闭时 worker.close()）
 */
export function createAuditExportWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      try {
        const result = await exportPendingAuditLogs();
        logger.debug({ module: 'auditExportQueue', ...result }, 'Audit export tick completed');
      } catch (err) {
        // 单次导出失败不致死——下次 tick 自动重试
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

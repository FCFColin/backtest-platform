/**
 * Webhook 投递重试队列（P2-02）
 *
 * Architecture: BullMQ 重复任务，每 1 分钟扫描待投递记录并尝试投递。
 * 企业为何需要：webhook 投递需要独立于 API 请求的异步重试机制。若在请求线程内重试，
 * 慢端点会拖垮 API；若仅靠 outbox publisher 重试，会与事件分发耦合。
 * 独立队列 + 固定间隔扫描投递表，实现可观测、可独立扩缩的重试通道。
 *
 * 权衡：
 * - 每 1 分钟扫描一次（非事件驱动）有最多 1 分钟延迟，但实现简单且无需为每条投递
 *   单独入队（投递表本身即是队列，扫描避免 N 次 Redis 往返）。
 * - 单实例运行（无分布式锁）——多实例部署时需在外层加 Redis 锁防重复投递，
 *   当前单实例 API 足够；后续扩多实例可在 processPendingDeliveries 内加 SELECT FOR UPDATE SKIP LOCKED。
 */
import { Queue, Worker } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { buildRedisBaseOptions, isSentinelMode } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { processPendingDeliveries } from '../application/webhookService.js';
import {
  createDeadLetterQueue,
  isFinalFailure,
  transferToDlq,
  SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS,
} from './dlqConfig.js';

const QUEUE_NAME = 'webhook-retry';
const JOB_ID = 'webhook-retry-cron'; // 固定 jobId 防止重复注册产生多个重复任务
const REPEAT_INTERVAL_MS = 60_000; // 每 1 分钟

// BullMQ 连接配置：复用 redisClient.ts 的 buildRedisBaseOptions（与 backtestQueue.ts 同模式），
// 自动支持 Sentinel（生产）与 REDIS_URL 单实例（开发）。
// maxRetriesPerRequest=null 是 BullMQ 硬性要求；enableReadyCheck=false 避免启动竞态。
const connectionOptions: RedisOptions = {
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

logger.info(
  { module: 'webhookQueue', mode: isSentinelMode ? 'sentinel' : 'standalone' },
  'Webhook retry queue connection configured',
);

export const webhookQueue = new Queue(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    // C-021: 失败任务保留 7 天（按 age 而非 count），最终失败任务转移到下方 webhookDlq。
    removeOnFail: { age: SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS },
  },
});

// C-021: webhook-retry 死信队列——接收最终失败任务，便于追溯/重放。
// BullMQ 开源版无原生 DLQ，此处手动创建并在 Worker failed 事件中转移（见 dlqConfig.ts）。
const webhookDlq = createDeadLetterQueue(QUEUE_NAME);

webhookQueue.on('error', (err) => {
  logger.error({ module: 'webhookQueue', err: err.message }, 'Webhook Queue connection error');
});

/**
 * 调度 webhook 重试重复任务（每 1 分钟一次）。
 *
 * 重复任务由 BullMQ 在 Redis 中维护调度，worker 进程消费时按下次到期时间触发。
 * 固定 jobId 保证重复注册幂等（不会产生多个并行重复任务）。
 *
 * 企业理由：在 API 进程启动时调度一次即可；worker 崩溃重启后 BullMQ 自动恢复调度。
 */
export async function scheduleWebhookRetryJob(): Promise<void> {
  // repeat.every 指定固定间隔；jobId 防止重复注册
  await webhookQueue.add(
    'webhook-retry',
    {},
    { repeat: { every: REPEAT_INTERVAL_MS }, jobId: JOB_ID },
  );
  logger.info(
    { module: 'webhookQueue', intervalMs: REPEAT_INTERVAL_MS },
    'Webhook retry job scheduled (every 1 minute)',
  );
}

/**
 * 创建 webhook 重试 Worker（在 API 进程内运行）。
 *
 * 企业理由：webhook 重试是轻量 IO 任务（HTTP + DB），与 API 共进程不影响计算密集任务。
 * 并发度 1 保证单实例内不重复扫描；跨实例隔离需 SELECT FOR UPDATE SKIP LOCKED（未来扩展）。
 *
 * @returns BullMQ Worker 实例（调用方负责在关闭时 worker.close()）
 */
export function createWebhookRetryWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      try {
        await processPendingDeliveries();
      } catch (err) {
        // 单次扫描失败不致死——下次扫描会重试；记录错误供排障
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

  // C-021: 失败任务转移到 DLQ。当前 processPendingDeliveries 的错误被上层 try/catch 吞掉
  // （单次扫描失败不致死，下一 tick 重试），故 BullMQ 视角下任务通常 completed 不会 failed；
  // 此处仍接入 DLQ 以保持三个队列一致，并为未来调整为抛出失败的场景预留转移通道。
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
      void transferToDlq(webhookDlq, QUEUE_NAME, job, err);
    }
  });

  logger.info({ module: 'webhookQueue' }, 'Webhook retry worker created');
  return worker;
}

/**
 * 数据更新 BullMQ 队列（P1-2）
 *
 * 替换 child_process.spawn('go', ['run', ...]) 为 BullMQ 异步任务。
 * Worker 进程通过 HTTP API 调用 Go data-fetcher 批量拉取价格数据，
 * 消除 `go run` 每次编译源码、`taskkill` Windows 依赖、内存全局状态不可水平扩展等问题。
 *
 * 队列名：data-update
 * 任务数据：{ mode: 'full' | 'incremental' }
 * 进度：BullMQ job.progress() 报告已完成标的数 / 总标的数
 */
import { Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { buildRedisBaseOptions, isSentinelMode } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { createDeadLetterQueue, SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS } from './dlqConfig.js';

/** 数据更新任务数据 */
export interface DataUpdateJobData {
  /** 更新模式：全量或增量 */
  mode: 'full' | 'incremental';
  /** 触发者用户 ID（用于审计） */
  triggeredBy?: string;
}

/** 数据更新任务结果 */
export interface DataUpdateJobResult {
  status: 'completed' | 'failed';
  totalTickers: number;
  completedTickers: number;
  failedTickers: string[];
  error?: string;
}

const QUEUE_NAME = 'data-update';

const connectionOptions: RedisOptions = {
  ...buildRedisBaseOptions(),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

logger.info(
  { module: 'dataUpdateQueue', mode: isSentinelMode ? 'sentinel' : 'standalone' },
  'BullMQ data-update queue connection configured',
);

export const dataUpdateQueue = new Queue<DataUpdateJobData, DataUpdateJobResult>(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 10 },
    // C-021: 失败任务保留 7 天（按 age 而非 count），最终失败任务转移到下方 dataUpdateDlq。
    removeOnFail: { age: SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS },
  },
});

// C-021: data-update 死信队列——接收 2 次重试后仍失败的任务，便于追溯/重放。
// BullMQ 开源版无原生 DLQ，此处手动创建并在 dataUpdateWorker.ts 的 failed 事件中转移。
export const dataUpdateDlq = createDeadLetterQueue(QUEUE_NAME);

dataUpdateQueue.on('error', (err) => {
  logger.error({ module: 'dataUpdateQueue', err: err.message }, 'BullMQ data-update queue error');
});

/**
 * 获取数据更新队列中当前活跃的任务。
 *
 * @returns 活跃任务数组（最多 1 个，因为数据更新是串行的）
 */
export async function getActiveUpdateJobs() {
  const jobs = await dataUpdateQueue.getJobs(['active', 'waiting', 'delayed'], 0, 10);
  return jobs;
}

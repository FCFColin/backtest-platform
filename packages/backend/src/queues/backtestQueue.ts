import { Queue, type Job } from 'bullmq';
import {
  bullmqConnectionOptions,
  isSentinelMode,
  appRedis,
} from '../infrastructure/redisClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  createDeadLetterQueue,
  isFinalFailure,
  SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS,
} from './queueUtils.js';
import { createQueueWorker } from './workerFactory.js';

export interface BacktestJobData {
  type: 'optimizer' | 'grid-search' | 'portfolio';
  payload: Record<string, unknown>;
  userId?: string;
  /** 提交任务的租户（组织）UUID，用于结果持久化的 RLS 隔离与所有权校验（ADR-009） */
  tenantId?: string;
  /** 提交者用户 UUID（区别于 API Key 调用方，后者为 null） */
  ownerUserId?: string | null;
}

export interface BacktestJobResult {
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
}

const QUEUE_NAME = 'backtest-compute';

// Security (T-28 / 输出过滤)：不记录 Redis URL/Sentinel 主机任何片段，凭证绝不进日志。
logger.info(
  { module: 'backtestQueue', mode: isSentinelMode ? 'sentinel' : 'standalone' },
  'BullMQ connection configured',
);

export const backtestQueue = new Queue<BacktestJobData, BacktestJobResult>(QUEUE_NAME, {
  connection: bullmqConnectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { age: SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS },
    // P0-03: 超时由 application 层控制（BullMQ 5.x defaultJobOptions 无此字段）
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

const backtestDlq = createDeadLetterQueue(QUEUE_NAME);

backtestQueue.on('error', (err) => {
  logger.error({ module: 'backtestQueue', err: err.message }, 'BullMQ Queue connection error');
});

export const PROGRESS_CHANNEL_PREFIX = 'backtest:progress:';

// DADR-045: 多 Pod 广播——每个 API Pod 各自订阅同一 channel，Worker 只需 publish 一次
function publishBacktestProgress(jobId: string, payload: Record<string, unknown>): void {
  const channel = `${PROGRESS_CHANNEL_PREFIX}${jobId}`;
  appRedis.publish(channel, JSON.stringify(payload)).catch((err) => {
    logger.warn({ err: String(err), jobId, channel }, '[backtestQueue] Redis publish 失败');
  });
}
export function createBacktestWorker(
  processFn: (job: Job<BacktestJobData>) => Promise<BacktestJobResult>,
) {
  // P0-03: 并发度从硬编码 3 改为环境变量 WORKER_CONCURRENCY（默认 3）。
  const concurrency = Math.max(1, config.WORKER_CONCURRENCY);
  logger.info({ module: 'backtestQueue', concurrency }, 'Creating BullMQ worker...');

  const worker = createQueueWorker<BacktestJobData, BacktestJobResult>(QUEUE_NAME, processFn, {
    concurrency,
    dlq: backtestDlq,
    onCompleted: (job) => {
      logger.info(
        {
          module: 'backtestQueue',
          jobId: job.id,
          type: job.data.type,
          durationMs: job.finishedOn ? job.finishedOn - job.processedOn! : undefined,
        },
        'Backtest job completed',
      );
      const jobId = String(job.id);
      const rv = job.returnvalue as BacktestJobResult | undefined;
      // 引擎 4xx 时 worker 返回 { status: 'failed' } 但 BullMQ 视为成功完成，须按 returnvalue 向 WS 广播真实终态
      const failed = rv?.status === 'failed';
      publishBacktestProgress(jobId, {
        jobId,
        status: failed ? 'failed' : 'completed',
        progressPct: 100,
        result: failed ? undefined : rv?.result,
        error: failed ? rv?.error : undefined,
      });
    },
    onFailed: (job, err) => {
      logger.error(
        {
          module: 'backtestQueue',
          jobId: job?.id,
          type: job?.data?.type,
          error: err.message,
          attemptsMade: job?.attemptsMade,
        },
        'Backtest job failed',
      );
      const jobId = job?.id ? String(job.id) : '';
      // 仅终态失败才通知 WS 客户端（与 DLQ 同判据）；中间重试失败静默重试
      if (job && jobId && isFinalFailure(job)) {
        publishBacktestProgress(jobId, { jobId, status: 'failed', error: err.message });
      }
    },
    // P1-04: Redis Pub/Sub 实时进度推送（多 Pod 广播，DADR-045）
    onProgress: (job, progress) => {
      const jobId = String(job.id);
      const progressPct = typeof progress === 'number' ? progress : undefined;
      publishBacktestProgress(jobId, { jobId, status: 'running', progressPct });
    },
  });

  logger.info({ module: 'backtestQueue' }, 'BullMQ worker created');
  return worker;
}

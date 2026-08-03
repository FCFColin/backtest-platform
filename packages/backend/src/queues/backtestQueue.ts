import { Queue, Worker, Job } from 'bullmq';
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
  transferToDlq,
  SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS,
} from './queueUtils.js';

// Architecture: BullMQ任务队列，将长任务从同步改为异步
// 企业为何需要：同步执行长任务阻塞Node.js事件循环，所有其他请求被挂起

export interface BacktestJobData {
  type: 'optimizer' | 'grid-search' | 'portfolio';
  payload: Record<string, unknown>;
  userId?: string;
  /** 提交任务的租户（组织）UUID，用于结果持久化的 RLS 隔离与所有权校验（ADR-034） */
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
    // C-021: 失败任务保留 7 天（按 age 而非 count），避免高吞吐场景过早剪枝丢失排障上下文。
    removeOnFail: { age: SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS },
    // Architecture: 指数退避重试，应对 Redis 瞬断、引擎瞬时错误等可恢复故障
    // 企业为何需要：单次失败直接丢弃会导致用户任务丢失，重试提升可靠性
    // 权衡：重试可能放大下游压力，但 3 次上限 + 5s 起步指数退避可控
    // P0-03: 执行超时不在 BullMQ defaultJobOptions（5.79 无此字段），由 application 层
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

// C-021: backtest-compute 死信队列——接收 3 次重试后仍失败的任务，便于追溯/重放。
const backtestDlq = createDeadLetterQueue(QUEUE_NAME);

backtestQueue.on('error', (err) => {
  logger.error({ module: 'backtestQueue', err: err.message }, 'BullMQ Queue connection error');
});

const PROGRESS_CHANNEL_PREFIX = 'backtest:progress:';

/**
 * Publish 进度消息到 Redis Pub/Sub channel（P1-04 实时进度推送）。
 *
 * 多 Pod 广播：每个 API Pod 的 WS 服务端各自订阅同一 channel，故 Worker 只需 publish 一次，
 * 所有 Pod 的连接客户端都能收到（ADR-045）。发布失败仅告警，不影响任务执行。
 */
function publishBacktestProgress(jobId: string, payload: Record<string, unknown>): void {
  const channel = `${PROGRESS_CHANNEL_PREFIX}${jobId}`;
  appRedis.publish(channel, JSON.stringify(payload)).catch((err) => {
    logger.warn({ err: String(err), jobId, channel }, '[backtestQueue] Redis publish 失败');
  });
}
export function createBacktestWorker(
  processFn: (job: Job<BacktestJobData>) => Promise<BacktestJobResult>,
) {
  // P0-03: 并发度从硬编码 3 改为环境变量 WORKER_CONCURRENCY（默认 4，生产建议 8）。
  const concurrency = Math.max(1, config.WORKER_CONCURRENCY);
  logger.info({ module: 'backtestQueue', concurrency }, 'Creating BullMQ worker...');

  const worker = new Worker<BacktestJobData, BacktestJobResult>(QUEUE_NAME, processFn, {
    connection: bullmqConnectionOptions,
    concurrency,
  });

  worker.on('completed', (job) => {
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
    publishBacktestProgress(jobId, {
      jobId,
      status: 'completed',
      progressPct: 100,
      result: rv?.result,
    });
  });

  worker.on('failed', (job, err) => {
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
    // C-021: 仅在"最终失败"（重试穷尽）时转移到 DLQ，避免每次重试都重复入队。
    if (job && isFinalFailure(job)) {
      void transferToDlq(backtestDlq, QUEUE_NAME, job, err);
    }
    const jobId = job?.id ? String(job.id) : '';
    if (!jobId) return;
    publishBacktestProgress(jobId, { jobId, status: 'failed', error: err.message });
  });

  worker.on('error', (err) => {
    logger.error({ module: 'backtestQueue', err: err.message }, 'BullMQ Worker connection error');
  });

  logger.info({ module: 'backtestQueue' }, 'BullMQ worker created');

  // P1-04: Redis Pub/Sub 实时进度推送（多 Pod 广播，ADR-045）
  worker.on('progress', (job, progress) => {
    const jobId = String(job.id);
    const progressPct = typeof progress === 'number' ? progress : undefined;
    publishBacktestProgress(jobId, { jobId, status: 'running', progressPct });
  });

  return worker;
}

import { Queue, Worker, Job } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Architecture: BullMQ任务队列，将长任务从同步改为异步
// 企业为何需要：同步执行长任务阻塞Node.js事件循环，所有其他请求被挂起
// 权衡：引入Redis依赖增加运维复杂度，但异步化是唯一正确的架构选择

export interface BacktestJobData {
  type: 'optimizer' | 'grid-search';
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

// BullMQ 连接配置：BullMQ/ioredis 的 connection 只接受标准 ioredis 选项（host/port/password/db/tls），
// 没有 connectionString 字段——传入它会被忽略并回退到默认 127.0.0.1:6379。
// 因此显式解析 REDIS_URL（支持 redis:// 与 rediss://、含凭证与库号）为 ioredis 选项。
function parseRedisUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const options: RedisOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  if (parsed.username) options.username = decodeURIComponent(parsed.username);
  if (parsed.password) options.password = decodeURIComponent(parsed.password);
  const db = parsed.pathname.replace(/^\//, '');
  if (db) options.db = Number(db);
  if (parsed.protocol === 'rediss:') options.tls = {};
  return options;
}

const connectionOptions: RedisOptions = parseRedisUrl(config.REDIS_URL);

// Security (T-28 / 输出过滤)：不记录 Redis URL 的任何片段——substring(0,20) 仍可能泄露
// `redis://user:pass@host` 中的凭证。仅记录是否已配置，凭证绝不进日志。
logger.info(
  { module: 'backtestQueue', redisConfigured: Boolean(config.REDIS_URL) },
  'BullMQ connection configured',
);

export const backtestQueue = new Queue<BacktestJobData, BacktestJobResult>(QUEUE_NAME, {
  connection: connectionOptions,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    // Architecture: 指数退避重试，应对 Redis 瞬断、引擎瞬时错误等可恢复故障
    // 企业为何需要：单次失败直接丢弃会导致用户任务丢失，重试提升可靠性
    // 权衡：重试可能放大下游压力，但 3 次上限 + 5s 起步指数退避可控
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
});

backtestQueue.on('error', (err) => {
  logger.error({ module: 'backtestQueue', err: err.message }, 'BullMQ Queue connection error');
});

// Worker will be started separately
export function createBacktestWorker(
  processFn: (job: Job<BacktestJobData>) => Promise<BacktestJobResult>,
) {
  logger.info({ module: 'backtestQueue', concurrency: 3 }, 'Creating BullMQ worker...');

  const worker = new Worker<BacktestJobData, BacktestJobResult>(QUEUE_NAME, processFn, {
    connection: connectionOptions,
    concurrency: 3,
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
  });

  worker.on('error', (err) => {
    logger.error({ module: 'backtestQueue', err: err.message }, 'BullMQ Worker connection error');
  });

  logger.info({ module: 'backtestQueue' }, 'BullMQ worker created');
  return worker;
}

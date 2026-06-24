import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Architecture: BullMQ任务队列，将长任务从同步改为异步
// 企业为何需要：同步执行长任务阻塞Node.js事件循环，所有其他请求被挂起
// 权衡：引入Redis依赖增加运维复杂度，但异步化是唯一正确的架构选择

export interface BacktestJobData {
  type: 'optimizer' | 'grid-search';
  payload: Record<string, unknown>;
  userId?: string;
}

export interface BacktestJobResult {
  status: 'completed' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
}

const QUEUE_NAME = 'backtest-compute';

// BullMQ连接配置：ioredis 原生支持 redis:// / rediss:// URL 格式（含密码、数据库号、TLS），
// 直接传入 connectionString 避免手动解析遗漏字段
const connectionOptions: { connectionString: string; maxRetriesPerRequest: null; enableReadyCheck: false } = {
  connectionString: config.REDIS_URL,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

logger.info({ module: 'backtestQueue', redisUrl: config.REDIS_URL ? `${config.REDIS_URL.substring(0, 20)}...` : '[empty]' }, 'BullMQ connection configured');

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
export function createBacktestWorker(processFn: (job: Job<BacktestJobData>) => Promise<BacktestJobResult>) {
  logger.info({ module: 'backtestQueue', concurrency: 3 }, 'Creating BullMQ worker...');

  const worker = new Worker<BacktestJobData, BacktestJobResult>(QUEUE_NAME, processFn, {
    connection: connectionOptions,
    concurrency: 3,
  });

  worker.on('completed', (job) => {
    logger.info({ module: 'backtestQueue', jobId: job.id, type: job.data.type, durationMs: job.finishedOn ? job.finishedOn - job.processedOn! : undefined }, 'Backtest job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ module: 'backtestQueue', jobId: job?.id, type: job?.data?.type, error: err.message, attemptsMade: job?.attemptsMade }, 'Backtest job failed');
  });

  worker.on('error', (err) => {
    logger.error({ module: 'backtestQueue', err: err.message }, 'BullMQ Worker connection error');
  });

  logger.info({ module: 'backtestQueue' }, 'BullMQ worker created');
  return worker;
}

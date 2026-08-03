import { Queue } from 'bullmq';
import { bullmqConnectionOptions, appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { requireRedis } from '../utils/redisFallback.js';

export const SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS = 86400 * 7;
const DLQ_COMPLETED_RETENTION_AGE_SECONDS = 86400 * 30;
const DLQ_NAME_SUFFIX = '-dlq';

interface DlqJobData {
  sourceQueue: string;
  sourceJobId: string;
  sourceJobName?: string;
  data: unknown;
  error: string;
  attemptsMade: number;
  transferredAt: number;
}

export function createDeadLetterQueue(sourceQueueName: string): Queue<DlqJobData> {
  const dlqName = `${sourceQueueName}${DLQ_NAME_SUFFIX}`;
  const dlq = new Queue<DlqJobData>(dlqName, {
    connection: bullmqConnectionOptions,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: DLQ_COMPLETED_RETENTION_AGE_SECONDS },
      removeOnFail: false,
    },
  });
  dlq.on('error', (err) => {
    logger.error({ module: 'dlqConfig', dlqName, err: err.message }, 'DLQ connection error');
  });
  logger.info({ module: 'dlqConfig', dlqName, sourceQueueName }, 'Dead letter queue created');
  return dlq;
}

export function isFinalFailure(job: {
  attemptsMade: number;
  opts?: { attempts?: number };
}): boolean {
  const maxAttempts = Math.max(1, job.opts?.attempts ?? 1);
  return job.attemptsMade >= maxAttempts;
}

export async function transferToDlq<T>(
  dlq: Queue<DlqJobData>,
  sourceQueueName: string,
  job: { id?: string | null; name?: string; data: T; attemptsMade: number },
  err: Error,
): Promise<void> {
  const sourceJobId = String(job.id ?? '');
  if (!sourceJobId) {
    logger.warn(
      { module: 'dlqConfig', sourceQueueName },
      'Failed job has no id, skip DLQ transfer',
    );
    return;
  }
  const dlqData: DlqJobData = {
    sourceQueue: sourceQueueName,
    sourceJobId,
    sourceJobName: job.name,
    data: job.data,
    error: err.message,
    attemptsMade: job.attemptsMade,
    transferredAt: Date.now(),
  };
  try {
    await dlq.add(`dlq:${sourceQueueName}`, dlqData, { jobId: sourceJobId });
    logger.warn(
      {
        module: 'dlqConfig',
        sourceQueueName,
        sourceJobId,
        dlqName: `${sourceQueueName}${DLQ_NAME_SUFFIX}`,
        error: err.message,
        attemptsMade: job.attemptsMade,
      },
      'Job transferred to dead letter queue (final failure)',
    );
  } catch (transferErr) {
    logger.error(
      { module: 'dlqConfig', sourceQueueName, sourceJobId, err: String(transferErr) },
      'Failed to transfer job to DLQ (source job remains in source queue failed list)',
    );
  }
}

const PROCESSING_PREFIX = 'bullmq:processing:';
const PROCESSED_PREFIX = 'bullmq:processed:';
const RESULT_PREFIX = 'bullmq:result:';
const PROCESSING_TTL_SEC = 2 * 60 * 60;
const PROCESSED_TTL_SEC = 24 * 60 * 60;

type JobClaimResult = 'claimed' | 'already_processed' | 'in_progress';

// 幂等 key 带 job type：BullMQ 自增 jobId 在计数器重置后会复用（如 Redis 恢复），
function idemKeys(
  jobId: string,
  type: string,
): { processingKey: string; processedKey: string; resultKey: string } {
  const scope = `${type}:${jobId}`;
  return {
    processingKey: PROCESSING_PREFIX + scope,
    processedKey: PROCESSED_PREFIX + scope,
    resultKey: RESULT_PREFIX + scope,
  };
}

export async function tryClaimJobProcessing(jobId: string, type: string): Promise<JobClaimResult> {
  const { processingKey, processedKey } = idemKeys(jobId, type);
  return requireRedis(processingKey, async () => {
    if ((await appRedis.exists(processedKey)) === 1) return 'already_processed';
    const ok = await appRedis.set(processingKey, '1', 'EX', PROCESSING_TTL_SEC, 'NX');
    return ok === 'OK' ? 'claimed' : 'in_progress';
  });
}

export async function getProcessedJobResult(
  jobId: string,
  type: string,
): Promise<Record<string, unknown> | null> {
  const { resultKey } = idemKeys(jobId, type);
  return requireRedis(resultKey, async () => {
    const raw = await appRedis.get(resultKey);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  });
}

export async function markJobProcessed(
  jobId: string,
  type: string,
  result: Record<string, unknown>,
): Promise<void> {
  const { processingKey, processedKey, resultKey } = idemKeys(jobId, type);
  await requireRedis(processedKey, async () => {
    await appRedis
      .multi()
      .set(processedKey, '1', 'EX', PROCESSED_TTL_SEC)
      .set(resultKey, JSON.stringify(result), 'EX', PROCESSED_TTL_SEC)
      .del(processingKey)
      .exec();
  });
}

export async function releaseJobClaim(jobId: string, type: string): Promise<void> {
  const { processingKey } = idemKeys(jobId, type);
  await requireRedis(processingKey, async () => {
    await appRedis.del(processingKey);
  });
  logger.debug({ jobId, type }, '[jobIdempotency] 释放处理声明以供重试');
}

const HEARTBEAT_KEY = 'worker:heartbeat';
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

export function startHeartbeat(): ReturnType<typeof setInterval> {
  void writeHeartbeat();
  const timer = setInterval(() => void writeHeartbeat(), HEARTBEAT_INTERVAL_MS);
  if (timer.unref) timer.unref();
  logger.info(
    { intervalMs: HEARTBEAT_INTERVAL_MS, key: HEARTBEAT_KEY },
    '[heartbeat] Worker heartbeat started',
  );
  return timer;
}

async function writeHeartbeat(): Promise<void> {
  try {
    await appRedis.set(HEARTBEAT_KEY, new Date().toISOString(), 'PX', HEARTBEAT_TIMEOUT_MS);
  } catch (err) {
    logger.warn({ err: String(err) }, '[heartbeat] Failed to write heartbeat');
  }
}

async function checkHeartbeat(): Promise<boolean> {
  try {
    return (await appRedis.get(HEARTBEAT_KEY)) !== null;
  } catch {
    return false;
  }
}

async function healthCheckMain(): Promise<void> {
  const healthy = await checkHeartbeat();
  logger[healthy ? 'info' : 'error'](
    `[health-check] Worker is ${healthy ? 'healthy' : 'unhealthy (heartbeat missing)'}`,
  );
  process.exit(healthy ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void healthCheckMain();
}

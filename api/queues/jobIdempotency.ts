/**
 * BullMQ 消费者幂等守卫（T-37 / ADR-024）
 *
 * 企业为何需要：重试会导致同一 jobId 重复执行。纯计算任务可重试，
 * 但未来带副作用（写库/通知）的任务必须用去重键保证 at-most-once 语义。
 */
import { appRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const PROCESSING_PREFIX = 'bullmq:processing:';
const PROCESSED_PREFIX = 'bullmq:processed:';
const RESULT_PREFIX = 'bullmq:result:';
/** 处理中声明 TTL（秒），应大于任务最大执行时长 */
const PROCESSING_TTL_SEC = 2 * 60 * 60;
/** 处理完成记录 TTL（秒），应大于任务最大重试窗口 */
const PROCESSED_TTL_SEC = 24 * 60 * 60;

const memProcessing = new Set<string>();
const memProcessed = new Set<string>();
const memResults = new Map<string, Record<string, unknown>>();

export type JobClaimResult = 'claimed' | 'already_processed' | 'in_progress';

/**
 * 尝试声明 job 处理权。
 *
 * @returns claimed — 获得处理权；already_processed — 已成功完成；in_progress — 其他 worker 正在处理
 */
export async function tryClaimJobProcessing(jobId: string): Promise<JobClaimResult> {
  const processingKey = PROCESSING_PREFIX + jobId;
  const processedKey = PROCESSED_PREFIX + jobId;

  try {
    if ((await appRedis.exists(processedKey)) === 1) {
      return 'already_processed';
    }

    const ok = await appRedis.set(processingKey, '1', 'EX', PROCESSING_TTL_SEC, 'NX');
    return ok === 'OK' ? 'claimed' : 'in_progress';
  } catch {
    if (memProcessed.has(jobId)) return 'already_processed';
    if (memProcessing.has(jobId)) return 'in_progress';
    memProcessing.add(jobId);
    return 'claimed';
  }
}

/**
 * 读取已成功处理任务的缓存结果。
 *
 * @returns 缓存的结果对象，未命中时返回 null
 */
export async function getProcessedJobResult(
  jobId: string,
): Promise<Record<string, unknown> | null> {
  const resultKey = RESULT_PREFIX + jobId;

  try {
    const raw = await appRedis.get(resultKey);
    if (!raw) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return memResults.get(jobId) ?? null;
  }
}

/**
 * 标记 job 已成功处理并缓存结果。
 *
 * @param jobId - BullMQ job ID
 * @param result - 任务成功时的业务结果
 */
export async function markJobProcessed(
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const processingKey = PROCESSING_PREFIX + jobId;
  const processedKey = PROCESSED_PREFIX + jobId;
  const resultKey = RESULT_PREFIX + jobId;

  try {
    await appRedis
      .multi()
      .set(processedKey, '1', 'EX', PROCESSED_TTL_SEC)
      .set(resultKey, JSON.stringify(result), 'EX', PROCESSED_TTL_SEC)
      .del(processingKey)
      .exec();
  } catch {
    memProcessing.delete(jobId);
    memProcessed.add(jobId);
    memResults.set(jobId, result);
  }
}

/**
 * 释放处理声明（处理失败且需重试时调用）。
 */
export async function releaseJobClaim(jobId: string): Promise<void> {
  const processingKey = PROCESSING_PREFIX + jobId;

  try {
    await appRedis.del(processingKey);
  } catch {
    memProcessing.delete(jobId);
  }
  logger.debug({ jobId }, '[jobIdempotency] 释放处理声明以供重试');
}

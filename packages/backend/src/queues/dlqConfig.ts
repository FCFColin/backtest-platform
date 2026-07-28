/**
 * Dead Letter Queue (DLQ) 统一配置与工具（C-021）
 *
 * 背景：BullMQ 开源版不原生支持 DLQ（`deadLetterQueue` 选项仅 Pro 版提供）。
 * 本模块封装统一的 DLQ 创建与"最终失败任务"转移逻辑，供 backtest / webhook /
 * dataUpdate 三个队列复用，消除三处重复实现。
 *
 * 策略（手动 DLQ）：
 * 1. 源队列 `removeOnFail: { age: 86400 * 7 }`——保留 7 天失败任务，便于即时排障
 *    （原 `count: 50` 在高吞吐场景会过早剪枝，丢失刚发生的失败上下文）。
 * 2. 每个源队列配一个 `<queue-name>-dlq` 死信队列。在 Worker 的 `failed` 事件中
 *    检测"最终失败"（`attemptsMade >= attempts`），将任务元数据 + 失败原因转移到 DLQ。
 * 3. DLQ 队列 `attempts: 1`（不重试，已穷尽源队列重试）、
 *    `removeOnComplete: { age: 86400 * 30 }`（完成态保留 30 天）、
 *    `removeOnFail: false`（永不自动清理，DLQ 的失败即终极告警，需人工介入）。
 *
 * 权衡：
 * - 源队列不用 `removeOnFail: false`：无限保留会让 Redis 内存增长失控。
 * - DLQ 用源 jobId 作为去重键（幂等），重复 `failed` 事件不会产生多条 DLQ 记录。
 * - 转移失败仅告警、不抛出：避免影响 BullMQ 主流程；源任务仍留在源队列 failed 列表，
 *   运维仍可通过 `queue.getFailed()` 检索。
 */
import { Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import { buildRedisBaseOptions } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';

/** 源队列失败任务保留时长（7 天），到期后由 Redis 自动清理 */
export const SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS = 86400 * 7;

/** DLQ 完成态任务保留时长（30 天），便于事后追溯 / 重放 / 根因分析 */
export const DLQ_COMPLETED_RETENTION_AGE_SECONDS = 86400 * 30;

/** 源队列失败任务最终归宿：DLQ 队列名后缀 */
export const DLQ_NAME_SUFFIX = '-dlq';

/** DLQ 任务数据结构（源任务元数据 + 失败上下文） */
export interface DlqJobData {
  /** 源队列名（如 backtest-compute） */
  sourceQueue: string;
  /** 源任务 ID */
  sourceJobId: string;
  /** 源任务名称 */
  sourceJobName?: string;
  /** 源任务原始数据（用于事后重放） */
  data: unknown;
  /** 失败错误消息 */
  error: string;
  /** 已重试次数（含本次失败，反映源队列 attempts 耗尽情况） */
  attemptsMade: number;
  /** 转移到 DLQ 的时间戳（ms） */
  transferredAt: number;
}

/**
 * 为指定源队列创建对应的死信队列。
 *
 * @param sourceQueueName - 源队列名（如 backtest-compute）
 * @returns BullMQ Queue 实例，用于接收最终失败任务
 */
export function createDeadLetterQueue(sourceQueueName: string): Queue<DlqJobData> {
  const dlqName = `${sourceQueueName}${DLQ_NAME_SUFFIX}`;
  const connectionOptions: RedisOptions = {
    ...buildRedisBaseOptions(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  const dlq = new Queue<DlqJobData>(dlqName, {
    connection: connectionOptions,
    defaultJobOptions: {
      // DLQ 不重试——源队列已穷尽重试，DLQ 仅作为最终归宿与可观测入口
      attempts: 1,
      removeOnComplete: { age: DLQ_COMPLETED_RETENTION_AGE_SECONDS },
      // 永不自动清理失败任务：DLQ 的失败即终极告警，需人工介入排查
      removeOnFail: false,
    },
  });
  dlq.on('error', (err) => {
    logger.error({ module: 'dlqConfig', dlqName, err: err.message }, 'DLQ connection error');
  });
  logger.info({ module: 'dlqConfig', dlqName, sourceQueueName }, 'Dead letter queue created');
  return dlq;
}

/**
 * 判断任务是否已穷尽重试（即"最终失败"），应转移到 DLQ。
 *
 * BullMQ 的 `failed` 事件在每次失败尝试后触发，仅当 `attemptsMade >= 配置 attempts`
 * 时才表示没有更多重试机会。`attempts` 缺省为 1（单次尝试不重试）。
 *
 * @param job - BullMQ Job（failed 事件回调参数）
 * @returns true 表示已穷尽重试，应转移到 DLQ
 */
export function isFinalFailure(job: {
  attemptsMade: number;
  opts?: { attempts?: number };
}): boolean {
  // attempts 缺省/为 0 时 BullMQ 视为单次尝试不重试，等价于 1 次。
  const maxAttempts = Math.max(1, job.opts?.attempts ?? 1);
  return job.attemptsMade >= maxAttempts;
}

/**
 * 将最终失败的任务转移到 DLQ。
 *
 * 仅记录任务元数据 + 失败原因，不重试执行。用源 jobId 作为 DLQ job 的 jobId
 * 保证幂等（重复 `failed` 事件触发不会产生多条 DLQ 记录）。转移失败仅告警、不抛出
 * （避免影响 BullMQ 主流程；源任务仍保留在源队列 failed 列表，可经
 * `queue.getFailed()` 检索）。
 *
 * @param dlq - 目标 DLQ 队列
 * @param sourceQueueName - 源队列名
 * @param job - 失败的源任务
 * @param err - 失败错误
 */
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
    // 用源 jobId 作为 DLQ job 的 jobId，保证幂等（重复触发不会产生多条 DLQ 记录）
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
    // 转移失败不抛出，避免影响 BullMQ 主流程；源任务仍保留在源队列的 failed 列表
    logger.error(
      {
        module: 'dlqConfig',
        sourceQueueName,
        sourceJobId,
        err: String(transferErr),
      },
      'Failed to transfer job to DLQ (source job remains in source queue failed list)',
    );
  }
}

import { Worker, type Queue, type Job } from 'bullmq';
import { bullmqConnectionOptions } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { isFinalFailure, transferToDlq, type DlqJobData } from './queueUtils.js';

export function createQueueWorker<T, R>(
  queueName: string,
  processor: (job: Job<T>) => Promise<R>,
  opts: {
    concurrency?: number;
    dlq?: Queue<DlqJobData>;
    onCompleted?: (job: Job<T>, result: R) => void;
    onFailed?: (job: Job<T> | undefined, err: Error) => void;
    onProgress?: (job: Job<T>, progress: string | boolean | number | object) => void;
  } = {},
): Worker<T, R> {
  const worker = new Worker<T, R>(queueName, processor, {
    connection: bullmqConnectionOptions,
    concurrency: opts.concurrency ?? 1,
  });
  worker.on('completed', (job, result) => opts.onCompleted?.(job, result));
  worker.on('failed', (job, err) => {
    if (job && opts.dlq && isFinalFailure(job)) {
      void transferToDlq(opts.dlq, queueName, job, err);
    }
    opts.onFailed?.(job, err);
  });
  if (opts.onProgress) worker.on('progress', opts.onProgress);
  worker.on('error', (err) => {
    logger.error({ module: queueName, err: err.message }, 'BullMQ Worker connection error');
  });
  return worker;
}

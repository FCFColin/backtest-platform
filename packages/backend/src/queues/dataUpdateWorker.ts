// P1-2: HTTP 拉取替代 spawn+go run（免编译、可取消、可水平扩展）
import { type Job, type Worker } from 'bullmq';
import { isSentinelMode } from '../infrastructure/redisClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/pool.js';
import { DEFAULT_START_DATE } from '../utils/misc.js';
import {
  DATA_UPDATE_QUEUE,
  dataUpdateDlq,
  type DataUpdateJobData,
  type DataUpdateJobResult,
} from './queueDefinitions.js';
import { createQueueWorker } from './workerFactory.js';
import { invalidateAllCache } from '../infrastructure/dataCache.js';

const BATCH_SIZE = 50;

const BATCH_TIMEOUT_MS = 120_000;

async function getAllTickers(): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query('SELECT ticker FROM tickers ORDER BY ticker');
  return rows.map((r: { ticker: string }) => r.ticker);
}

async function fetchBatchPrices(
  tickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ successCount: number; failedTickers: string[] }> {
  const url = `${config.GO_DATA_SERVICE_URL}/api/data/price/batch`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Data-Service-Auth': config.DATA_SERVICE_AUTH_TOKEN,
      },
      body: JSON.stringify({ tickers, startDate, endDate }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`data-fetcher batch response: HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      success: boolean;
      data: Record<string, unknown>;
    };

    let successCount = 0;
    const failedTickers: string[] = [];
    for (const [ticker, value] of Object.entries(json.data ?? {})) {
      if (value && typeof value === 'object' && 'error' in value) {
        failedTickers.push(ticker);
      } else {
        successCount++;
      }
    }

    return { successCount, failedTickers };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function processDataUpdateJob(job: Job<DataUpdateJobData>): Promise<DataUpdateJobResult> {
  const { mode } = job.data;
  logger.info({ jobId: job.id, mode }, '[dataUpdateWorker] 开始数据更新');

  const allTickers = await getAllTickers();
  const totalTickers = allTickers.length;

  if (totalTickers === 0) {
    return {
      status: 'completed',
      totalTickers: 0,
      completedTickers: 0,
      failedTickers: [],
    };
  }

  const endDate = new Date().toISOString().substring(0, 10);
  const startDate =
    mode === 'incremental'
      ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
      : DEFAULT_START_DATE;

  let completedTickers = 0;
  const failedTickers: string[] = [];

  for (let i = 0; i < allTickers.length; i += BATCH_SIZE) {
    const batch = allTickers.slice(i, i + BATCH_SIZE);

    try {
      const result = await fetchBatchPrices(batch, startDate, endDate);
      completedTickers += result.successCount;
      failedTickers.push(...result.failedTickers);
    } catch (err) {
      logger.error(
        { err: String(err), batch: `${i}-${i + batch.length}` },
        '[dataUpdateWorker] 批次失败',
      );
      failedTickers.push(...batch);
    }

    await job.updateProgress(i + batch.length);
  }

  if (completedTickers > 0) await invalidateAllCache();

  // S16：全部失败时不能伪装成功——抛错触发 BullMQ 重试（attempts=2）并最终进入 DLQ
  if (completedTickers === 0 && failedTickers.length > 0) {
    const sample = failedTickers.slice(0, 20).join(', ');
    throw new Error(
      `[dataUpdateWorker] 数据更新全部失败：${failedTickers.length}/${totalTickers} 个 ticker 失败（${sample}${failedTickers.length > 20 ? '...' : ''}）`,
    );
  }

  logger.info(
    { jobId: job.id, mode, totalTickers, completedTickers, failed: failedTickers.length },
    '[dataUpdateWorker] 数据更新完成',
  );

  return {
    status: 'completed',
    totalTickers,
    completedTickers,
    failedTickers,
  };
}

export function createDataUpdateWorker(): Worker<DataUpdateJobData, DataUpdateJobResult> {
  logger.info(
    { module: 'dataUpdateWorker', mode: isSentinelMode ? 'sentinel' : 'standalone' },
    'Creating data-update worker...',
  );

  const worker = createQueueWorker<DataUpdateJobData, DataUpdateJobResult>(
    DATA_UPDATE_QUEUE,
    processDataUpdateJob,
    {
      dlq: dataUpdateDlq,
      onCompleted: (job) => {
        logger.info(
          {
            jobId: job.id,
            durationMs: job.finishedOn ? job.finishedOn - (job.processedOn ?? 0) : 0,
          },
          '[dataUpdateWorker] Job completed',
        );
      },
    },
  );

  return worker;
}

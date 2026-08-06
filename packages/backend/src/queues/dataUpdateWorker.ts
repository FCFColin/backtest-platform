/**
 * 数据更新 BullMQ Worker（P1-2）
 *
 * 替换 child_process.spawn + `go run` 编译模式：
 * Worker 从 PostgreSQL 读取全部标的列表，分批调用 Go data-fetcher 的
 * `/api/data/price/batch` HTTP 端点拉取并存储价格数据。
 *
 * 优势：
 * - 无需 `go run` 每次编译（使用已运行的 data-fetcher HTTP 服务）
 * - 无需 `taskkill`（BullMQ job.remove() 即可取消）
 * - 无内存全局状态（进度存储在 Redis/BullMQ job 中）
 * - 可在 Linux 容器环境正常工作
 * - 可水平扩展（多 Worker 实例由 BullMQ 自动分配任务）
 */
import { type Job, type Worker } from 'bullmq';
import { isSentinelMode } from '../infrastructure/redisClient.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPool } from '../db/pool.js';
import {
  DATA_UPDATE_QUEUE,
  dataUpdateDlq,
  type DataUpdateJobData,
  type DataUpdateJobResult,
} from './queueDefinitions.js';
import { createQueueWorker } from './workerFactory.js';

/** 每批处理的标的数量（避免单次 HTTP 请求过大） */
const BATCH_SIZE = 50;

const BATCH_TIMEOUT_MS = 120_000;

/**
 * 从 PostgreSQL 读取全部标的列表。
 *
 * @returns 标的代码数组
 */
async function getAllTickers(): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query('SELECT ticker FROM tickers ORDER BY ticker');
  return rows.map((r: { ticker: string }) => r.ticker);
}

/**
 * 调用 Go data-fetcher 批量价格端点拉取并存储数据。
 *
 * data-fetcher 的 `/api/data/price/batch` 端点会从外部数据源拉取价格
 * 并写入 PostgreSQL（由 store 层处理 upsert）。
 *
 * @param tickers - 标的代码列表
 * @param startDate - 起始日期
 * @param endDate - 结束日期
 * @returns 成功的标的数
 */
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

/**
 * 数据更新任务处理函数。
 *
 * 全量更新：从 2000-01-01 至今
 * 增量更新：仅拉取最近 30 天数据
 *
 * @param job - BullMQ 任务
 * @returns 任务结果
 */
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
      : '2000-01-01';

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

/**
 * 创建数据更新 Worker。
 *
 * @returns BullMQ Worker 实例
 */
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

/**
 * BullMQ Worker 启动入口
 *
 * 独立进程运行，消费 backtest-compute 队列中的任务。
 * 启动方式：node --import tsx api/queues/worker.ts
 *
 * Architecture: Worker独立进程，与API服务器解耦
 * 企业为何需要：Worker崩溃不影响API服务，可独立水平扩展
 * 权衡：需额外进程管理（pm2/k8s），但隔离性是生产级必需
 */

import { createBacktestWorker, type BacktestJobData, type BacktestJobResult } from './backtestQueue.js';
import { executeOptimization } from '../routes/backtestOptimizerRoutes.js';
import { executeGridSearch } from '../routes/tacticalGridRoutes.js';
import { logger } from '../utils/logger.js';
import type { Job } from 'bullmq';

/**
 * 任务处理核心逻辑（导出供单元测试使用）
 *
 * Architecture: 提取为独立导出函数，使worker进程和单元测试共用同一逻辑
 * 企业为何需要：匿名函数无法被单元测试直接调用，导出后可验证任务分发正确性
 */
export async function processBacktestJob(job: Job<BacktestJobData>): Promise<BacktestJobResult> {
  const { type, payload } = job.data;

  logger.info({ type, jobId: job.id }, '[worker] 开始处理任务');

  try {
    if (type === 'optimizer') {
      const result = await executeOptimization(payload);
      if (result.success) {
        return { status: 'completed', result: result.data };
      } else {
        return { status: 'failed', error: result.error };
      }
    }

    if (type === 'grid-search') {
      const result = await executeGridSearch(payload);
      if (result.success) {
        return { status: 'completed', result: result.data };
      } else {
        return { status: 'failed', error: result.error };
      }
    }

    // 未知任务类型
    logger.warn({ type, jobId: job.id }, '[worker] 未知任务类型');
    return { status: 'failed', error: `Unknown job type: ${type}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, error: message }, '[worker] 任务执行失败');
    return { status: 'failed', error: message };
  }
}

const worker = createBacktestWorker(processBacktestJob);

logger.info('[worker] Backtest worker started, waiting for jobs...');

// 优雅关闭（Task 5.3）
//
// 企业理由：Worker 收到 SIGTERM 时需等待当前任务完成，
// 避免任务中途被杀导致数据不一致。30s 强制退出兜底防止
// worker.close() 因长任务挂起。标志位防止重复触发。
let workerShuttingDown = false;

async function shutdownWorker(signal: string): Promise<void> {
  if (workerShuttingDown) {
    logger.info({ signal }, '[worker] 已在关闭流程中，忽略重复信号');
    return;
  }
  workerShuttingDown = true;
  logger.info({ signal }, `[worker] ${signal} received, shutting down gracefully...`);

  // 30s 强制退出兜底：防止 worker.close() 因长任务挂起
  const forceExitTimeout = setTimeout(() => {
    logger.error('[worker] Graceful shutdown timed out after 30s, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    await worker.close();
    logger.info('[worker] Graceful shutdown complete');
  } catch (err) {
    logger.error({ err }, '[worker] Error during shutdown');
  } finally {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

process.on('SIGTERM', () => {
  void shutdownWorker('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdownWorker('SIGINT');
});

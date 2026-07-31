/**
 * 统一 Worker 进程入口（P0-1）
 *
 * 启动所有 BullMQ Worker（backtest + webhook），注册 SIGTERM/SIGINT 优雅关闭。
 * 作为独立进程运行，与 API 服务器解耦——API 崩溃/重启不影响正在处理的任务。
 *
 * 启动方式：
 *   生产：node dist/queues/workerEntrypoint.js
 *   开发：node --import tsx src/queues/workerEntrypoint.ts
 *
 * Architecture: Worker 独立进程（ADR-037 tenant-fair 调度 + ADR-031 fail-closed）
 * 企业为何需要：Worker 崩溃不影响 API 服务，可独立水平扩展、独立资源配额、独立滚动更新
 */
import { initTracing, shutdownTracing } from '../tracing.js';
initTracing();

import { validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { initDb } from '../infrastructure/dataFacade.js';
import { closeDb } from '../db/pool.js';
import { eventDispatcher } from '../domain/events/events.js';
import { BacktestCompletedHandler, RunCompletedHandler } from '../application/completedHandlers.js';
import { createWebhookRetryWorker, scheduleWebhookRetryJob } from './webhookQueue.js';
import { createDataUpdateWorker } from './dataUpdateWorker.js';
import { startHeartbeat } from './healthCheck.js';
import { shutdownWorker } from './worker.js'; // Backtest worker (module-level side effect: creates Worker at import time)
import type { Worker } from 'bullmq';

validateConfig();

// DDD: 注册领域事件处理器（与 server.ts 保持一致）
eventDispatcher.register(new BacktestCompletedHandler());
eventDispatcher.register(new RunCompletedHandler());

let webhookWorker: Worker | null = null;
let dataUpdateWorker: Worker | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 优雅关闭所有 Worker。
 *
 * 关闭顺序：停止 heartbeat → 关闭 webhook worker → 关闭 backtest worker（worker.ts 内已注册）→ 关闭 DB。
 * 30s 强制退出兜底防止长任务挂起。
 *
 * @param signal - 触发关闭的信号名称
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    logger.info({ signal }, '[worker-entry] 已在关闭流程中，忽略重复信号');
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, `[worker-entry] ${signal} received, shutting down gracefully...`);

  const forceExitTimeout = setTimeout(() => {
    logger.error('[worker-entry] Graceful shutdown timed out after 60s, forcing exit');
    process.exit(1);
  }, 60_000);

  try {
    // 停止 heartbeat
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    // 关闭 webhook worker
    if (webhookWorker) {
      await webhookWorker.close();
      webhookWorker = null;
    }

    // 关闭 data-update worker
    if (dataUpdateWorker) {
      await dataUpdateWorker.close();
      dataUpdateWorker = null;
    }

    // D9-H5: 直接调用 worker.ts 导出的 shutdownWorker，消除竞态（不再依赖两组 SIGTERM 处理器）。
    await shutdownWorker(signal);

    await closeDb();
    // D9-H6: 关闭 OTel SDK，flush 所有 span（由 tracing.ts 统一管理，不再在 tracing.ts 注册 SIGTERM）。
    await shutdownTracing();
    logger.info('[worker-entry] Graceful shutdown complete');
  } catch (err) {
    logger.error({ err }, '[worker-entry] Error during shutdown');
  } finally {
    clearTimeout(forceExitTimeout);
    process.exit(0);
  }
}

async function main(): Promise<void> {
  logger.info('[worker-entry] Starting unified worker process...');

  // 初始化数据库（Worker 需要读取租户计划配额、持久化结果）
  try {
    await initDb();
    logger.info('[worker-entry] Database initialized');
  } catch (err) {
    logger.error({ err }, '[worker-entry] Database initialization failed');
    throw err;
  }

  // 启动 webhook 重试 worker
  try {
    webhookWorker = createWebhookRetryWorker();
    await scheduleWebhookRetryJob();
    logger.info('[worker-entry] Webhook retry worker started');
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Webhook retry worker startup failed');
  }

  // 启动 data-update worker（P1-2：替换 child_process.spawn）
  try {
    dataUpdateWorker = createDataUpdateWorker();
    logger.info('[worker-entry] Data update worker started');
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Data update worker startup failed');
  }

  // 启动 Redis heartbeat 健康检查
  try {
    heartbeatTimer = startHeartbeat();
  } catch (err) {
    logger.warn({ err }, '[worker-entry] Heartbeat startup failed');
  }

  logger.info('[worker-entry] All workers started, waiting for jobs...');
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

// 未捕获异常必须终止进程
process.on('uncaughtException', (err) => {
  logger.error({ err }, '[worker-entry] Uncaught exception, shutting down');
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, '[worker-entry] Unhandled rejection, shutting down');
  void shutdown('unhandledRejection');
});

void main().catch((err) => {
  logger.error({ err }, '[worker-entry] Fatal error during startup');
  process.exit(1);
});